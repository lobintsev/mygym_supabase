const express = require('express');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const toggleDevice = require('./toggleDevice');
const listDevices = require('./src/helpers/alice/listDevices');
const deviceInfo = require('./src/helpers/alice/deviceInfo');
const swaggerUi = require('swagger-ui-express')
const swaggerFile = require('./swagger_output.json')
const initPayment = require('./src/helpers/tinkoff/init.js');
const sendPostMessage = require('./src/helpers/sendPostMessage.js');
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");


const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile))

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Создайте экземпляр rate limiter
const limiter = rateLimit({
    windowMs: 10000, // 1 секунда
    max: 1, // лимит каждого user_id до 1 запросов в течение windowMs
    keyGenerator: function (req) {
        return req.body.user_id || req.body.telegram_id; // используйте user_id в теле запроса как ключ
    }
});

// Создайте экземпляр slow down
const speedLimiter = slowDown({
    windowMs: 5000, // 1 секунда
    delayAfter: 1, // начать замедлять после 1 запроса
    delayMs: () => 500, // замедлить на 500 мс каждый последующий запрос
    keyGenerator: function (req) {
        return req.body.user_id || req.body.telegram_id; // используйте user_id в теле запроса как ключ
    }
});

app.use("/subscriptions/buy/userbalance", limiter, speedLimiter);
app.use("/goods/buy/userbalance", limiter, speedLimiter);



//ALICE

app.get('/alice/info', async (req, res) => {
    // #swagger.tags = ['Alice']
    const { data, error } = await listDevices();
    if (error) {
        console.error('Error fetching devices:', error);
        res.status(500).send('Internal Server Error');
        return;
    }


    res.json(data);
});

app.get('/alice/devices/:deviceId', async (req, res) => {
    // #swagger.tags = ['Alice']
    deviceId = req.params.deviceId;
    const { data, error } = await deviceInfo(deviceId);
    if (error) {
        console.error('Error fetching devices:', error);
        res.status(500).send('Internal Server Error');
        return;
    }


    res.json(data);
});


app.post('/alice/devices/onoff/:deviceId', async (req, res) => {
    // #swagger.tags = ['Alice']
    deviceId = req.params.deviceId;
    try {
        await toggleDevice(deviceId, true);  // Запускаем функцию toggleDevice с loc_id
        res.status(200).send('Устройство успешно переключено');
    } catch (error) {
        console.error('Ошибка при переключении устройства:', error);
        res.status(500).send('Ошибка сервера');
    }
});



//USERS

app.get('/users', async (req, res) => {
    // #swagger.tags = ['Users']

    const userId = req.query.user_id;
    const telegramId = req.query.telegram_id;

    try {
        // Initialize query builder
        let query = supabase.from('users').select('*');

        // Apply filters based on query parameters if provided
        if (userId) {
            query = query.eq('id', userId);
        }
        if (telegramId) {
            query = query.eq('telegram_id', telegramId);
        }

        // Execute the query
        const { data, error } = await query;

        // Handle possible errors from the query
        if (error) {
            console.error('Error fetching users:', error);
            res.status(500).send('Internal Server Error');
            return;
        }

        if (data && data.length == 0) {
            res.status(204).send('No data found');
        }

        // Send the retrieved data as a JSON response
        res.json(data);
    } catch (err) {
        // Catch any other errors that may occur and send an appropriate response
        console.error('Unexpected error:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/users', async (req, res) => {
    // #swagger.tags = ['Users']
    const { telegram_id, first_name, last_name, telegram_nickname, phone } = req.body;
    const role = 'CUSTOMER';
    if (!telegram_id || !first_name) {
        res.status(400).send('Bad Request: Missing required fields');
        return;
    }

    const { error: insertError } = await supabase
        .from('users')
        .insert([{ telegram_id, first_name, last_name, telegram_nickname, phone, role }]);
    if (insertError) {
        console.error('Error creating user:', insertError);
        if (insertError.code === '23505') {
            res.status(409).send('Conflict: User with this telegram_id already exists');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }

    const { data, error: selectError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id);
    if (selectError) {
        console.error('Error fetching user:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    const user_id = data[0].id;

    const { error: insertBalanceError } = await supabase
        .from('balance')
        .insert([{ user_id, amount: 0 }]);
    if (insertBalanceError) {
        console.error('Error creating balance:', insertBalanceError);
        res.status(500).send('Internal Server Error');
        return;
    }


    res.status(201).json(data[0]);
});

app.delete('/users/:id', async (req, res) => {
    // #swagger.tags = ['Users']

    const user_id = req.params.id;
    const { data, error } = await supabase.rpc('delete_user_and_relations', {
        user_id: user_id,
    });

    if (error.code = '23503') {
        console.error('Ошибка:', error);
        res.status(409).send('CONFLICT')
        return;
    }

    res.json(data);
});


app.patch('/users/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;
    const { first_name, last_name, telegram_nickname, phone, email, role } = req.body;

    if (!first_name && !last_name && !telegram_nickname && !phone && !role) {
        res.status(400).send('Bad Request: No fields to update');
        return;
    }

    const { error: updateError } = await supabase
        .from('users')
        .update({ first_name, last_name, telegram_nickname, phone, email, role })
        .eq('telegram_id', telegram_id);

    if (updateError) {
        console.error('Error updating user:', updateError);
        res.status(500).send('Internal Server Error');
        return;
    }

    const { data: updatedUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id);

    if (fetchError || !updatedUser || updatedUser.length === 0) {
        console.error('Error fetching updated user:', fetchError || 'User not found');
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(updatedUser[0]);
});


app.get('/users/trainers/:telegram_id', async (req, res) => {

    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)
        .limit(1)
        .single()

    if (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    if (data) {

    } else {
        res.status(404).send('User Not Found');
    }

    const user_id = data.id;

    const { data: userTrainers, error: userTrainersError } = await supabase
        .from('user_trainers')
        .select('*, trainers (*)')
        .eq('user_id', user_id);

    if (userTrainersError) {
        console.error('Error fetching user:', userTrainersError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(userTrainers);
}
);

app.post('/users/trainers/assign/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']

    const { trainers_id } = req.body;
    const telegram_id = req.params.telegram_id;

    if (!trainers_id) {
        res.status(400).send('Bad Request: Missing required fields');
        return;
    }


    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)
        .limit(1)
        .single()



    if (error) {

        console.error('Error fetching user:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    if (!data) {
        res.status(404).send('USER_NOT_FOUND');
        return;
    }

    const users_id = data.id;

    const { data: userTrainersData, error: userTrainersError } = await supabase
        .from('user_trainers')
        .insert([{ users_id, trainers_id }]);


    if (userTrainersError) {
        console.error('Error creating userTrainers:', userTrainersError);
        if (userTrainersError.code === '23505') {
            res.status(409).send('USER_TRAINERS_ALREADY_EXISTS');
            return;
        }
        if (userTrainersError.code === '23503') {
            res.status(409).send('TRAINERS_NOT_FOUND');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }



    res.status(201).json(userTrainersData);
});

app.get('/users/actions', async (req, res) => {
    // #swagger.tags = ['Users']
    const { data, error } = await supabase.from('users').select(`
    id, 
    actions ( id, action )
  `)

    if (error) {
        console.error('Error fetching usersActions:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.get('/users/actions/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;


    const userQueryResult = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userQueryResult.error) {
        console.error('Error fetching user:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    if (!userQueryResult.data || userQueryResult.data.length === 0) {
        res.status(404).send('User Not Found');
        return;
    }

    const user_id = userQueryResult.data[0].id;


    const actionsQueryResult = await supabase
        .from('actions')
        .select('id, action')
        .eq('user_id', user_id);

    if (actionsQueryResult.error) {
        console.error('Error fetching actions:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(actionsQueryResult.data);
});

app.get('/users/balance', async (req, res) => {
    // #swagger.tags = ['Users']
    // #swagger.parameters['negative'] = { description: 'Show only negative balance', type: 'boolean' }
    const negative = req.query.negative;
    const telegram_id = req.query.telegram_id;

    let actionsQuery = supabase
        .from('balance')
        .select('*, users!inner (first_name, last_name, telegram_id)')


    if (negative === 'true') {
        actionsQuery = actionsQuery.lt('amount', 0); // Remove the unnecessary comma
    }
    if (telegram_id) {
        actionsQuery = actionsQuery.eq('users.telegram_id', telegram_id); // Remove the unnecessary comma
    }

    const actionsQueryResult = await actionsQuery; // Await the actionsQuery

    if (actionsQueryResult.error) {
        console.error('Error fetching balances:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(actionsQueryResult.data);
});


app.get('/users/balance/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;

    const userQueryResult = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userQueryResult.error) {
        console.error('Error fetching user:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }


    if (!userQueryResult.data || userQueryResult.data.length === 0) {
        res.status(404).send('User Not Found');
        return;
    }

    const user_id = userQueryResult.data[0].id;


    const actionsQueryResult = await supabase
        .from('balance')
        .select('*')
        .eq('user_id', user_id);

    if (actionsQueryResult.error) {
        console.error('Error fetching balance:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(actionsQueryResult.data[0]);
});

app.post('/users/balance/:telegram_id/topup', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;
    const { amount } = req.body;

    // Проверка входных данных
    if (!amount || isNaN(amount) || amount <= 0) {
        res.status(400).send('Bad Request: Invalid amount');
        return;
    }

    // Получить user_id из таблицы users
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userError || !userData || userData.length === 0) {
        console.error('Error fetching user:', userError || 'User not found');
        res.status(500).send('Internal Server Error');
        return;
    }

    const user_id = userData[0].id;

    // Создать новую запись в таблице transactions
    const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{ user_id, amount, type: 'DEP' }]);

    if (transactionError) {
        console.error('Error creating transaction:', transactionError);
        res.status(500).send('Internal Server Error');
        return;
    }

    // Проверьте, существует ли запись balance для user_id
    const { data: balanceData, error: balanceCheckError } = await supabase
        .from('balance')
        .select('user_id')
        .eq('user_id', user_id);

    if (balanceCheckError || !balanceData || balanceData.length === 0) {
        const { error: balanceCreateError } = await supabase
            .from('balance')
            .insert([{ user_id, amount }]);

        if (balanceCreateError) {
            console.error('Error creating balance:', balanceCreateError);
            res.status(500).send('Internal Server Error');
            return;
        }
    } else {
        // Обновите запись в таблице balance для user_id, если запись уже существует
        const { error: balanceUpdateError } = await supabase
            .rpc('update_balance', { p_user_id: Number(user_id), p_amount: Number(amount) });

        if (balanceUpdateError) {
            console.error('Error updating balance:', balanceUpdateError);
            res.status(500).send('Internal Server Error');
            return;
        }
    }

    res.status(201).send('Topup successful');
});

app.post('/users/balance/:telegram_id/chargeoff', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;
    const { amount } = req.body;

    // Проверка входных данных
    if (!amount || isNaN(amount) || amount <= 0) {
        res.status(400).send('Bad Request: Invalid amount');
        return;
    }

    // Получить user_id из таблицы users
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userError || !userData || userData.length === 0) {
        console.error('Error fetching user:', userError || 'User not found');
        res.status(500).send('Internal Server Error');
        return;
    }

    const user_id = userData[0].id;

    // Создать новую запись в таблице transactions
    const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{ user_id, amount, type: 'WITH' }]);

    if (transactionError) {
        console.error('Error creating transaction:', transactionError);
        res.status(500).send('Internal Server Error');
        return;
    }

    // Проверьте, существует ли запись balance для user_id
    const { data: balanceData, error: balanceCheckError } = await supabase
        .from('balance')
        .select('user_id')
        .eq('user_id', user_id);

    if (balanceCheckError || !balanceData || balanceData.length === 0) {
        const { error: balanceCreateError } = await supabase
            .from('balance')
            .insert([{ user_id, amount: -amount }]);

        if (balanceCreateError) {
            console.error('Error creating balance:', balanceCreateError);
            res.status(500).send('Internal Server Error');
            return;
        }
    } else {
        // Обновите запись в таблице balance для user_id, если запись уже существует
        const { error: balanceUpdateError } = await supabase
            .rpc('update_balance', { p_user_id: Number(user_id), p_amount: Number(-amount) });

        if (balanceUpdateError) {
            console.error('Error updating balance:', balanceUpdateError);
            res.status(500).send('Internal Server Error');
            return;
        }
    }

    res.status(201).send('Chargeoff successful');
});

app.get('/users/transactions/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;


    const userQueryResult = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userQueryResult.error) {
        console.error('Error fetching user:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }


    if (!userQueryResult.data || userQueryResult.data.length === 0) {
        res.status(404).send('User Not Found');
        return;
    }

    const user_id = userQueryResult.data[0].id;

    const actionsQueryResult = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user_id);

    if (actionsQueryResult.error) {
        console.error('Error fetching balance:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(actionsQueryResult.data);
});

app.get('/users/purchases/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;


    const userQueryResult = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userQueryResult.error) {
        console.error('Error fetching user:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }


    if (!userQueryResult.data || userQueryResult.data.length === 0) {
        res.status(404).send('User Not Found');
        return;
    }

    const user_id = userQueryResult.data[0].id;

    const actionsQueryResult = await supabase
        .from('user_purchases')
        .select(`*, goods (*)`)
        .eq('user_id', user_id)

    if (actionsQueryResult.error) {
        console.error('Error fetching purchases:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(actionsQueryResult.data);
});


app.get('/users/subscriptions/', async (req, res) => {
    // #swagger.tags = ['Users']
    // #swagger.description = 'Get all subscriptions'
    // #swagger.parameters['subscription_id'] = { description: 'Subscription ID', type: 'array', items: { type: 'integer' } }
    // #swagger.parameters['from_date'] = { description: 'From date', type: 'timestampz' }
    // #swagger.parameters['to_date'] = { description: 'To date', type: 'timestampz' }
    // #swagger.parameters['status'] = { description: 'Status', type: 'enum', enum: ['ACTIVE', 'PAUSED', 'CANCELED'] }

    let subInputString = req.query.subscription_id; // Get the subscription IDs from the query parameters
    let finish_date = req.query.to_date; // Get the finish date from the query parameters
    let start_date = req.query.from_date; // Get the start date from the query parameters
    let status = req.query.status; // Get the status from the query parameters
    let telegram_id = req.query.telegram_id; // Get the telegram_id from the query parameters

    let query = supabase
        .from('user_subscriptions')
        .select('*, subscriptions (*), users!inner (*)')
        .filter(finish_date ? 'finish' : '', finish_date ? 'lte' : '', finish_date || '')
        .filter(start_date ? 'start' : '', start_date ? 'gte' : '', start_date || '')

    if (subInputString) {
        query = query.in('subscription_id', subInputString.split(','));
    }
    if (status) {
        query = query.in('status', status.split(','));
    }
    if (telegram_id) {
        query = query.eq('users.telegram_id', telegram_id); // Remove the unnecessary comma
    }

    const userQueryResult = await query;

    if (userQueryResult.error) {
        console.error('Error fetching user subscriptions:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(userQueryResult.data);

});

app.get('/users/subscriptions/check/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    // #swagger.description = 'Check if user has any active subscriptions'
    const telegram_id = req.params.telegram_id;


    const userQueryResult = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id)
        .eq('status', 'ACTIVE')

    if (userQueryResult.error) {
        console.error('Error fetching user:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }


    if (!userQueryResult.data || userQueryResult.data.length === 0) {
        res.status(404).send('User Not Found');
        return;
    }

    const user_id = userQueryResult.data[0].id;

    const actionsQueryResult = await supabase
        .from('user_subscriptions')
        .select("*")
        .eq('user_id', user_id)
        .in('status', ['ACTIVE', 'EXPIRING', 'SUSPENDED']  )

    const hasSubscriptions = actionsQueryResult.data.length > 0;

    if (actionsQueryResult.error) {
        console.error('Error fetching balance:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    let result = {
        'status': hasSubscriptions
    };
    res.json(result);
});

app.patch('/users/subscriptions/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    // #swagger.description = 'Update subscription. Only status field avaliable for now! Periods and other fields will be added later'
    // #swagger.parameters['status'] = { in: 'body', description: 'Status', type: 'string', enum: ['ACTIVE', 'PAUSED', 'CANCELED', 'SUSPENDED'] }
    const telegram_id = req.params.telegram_id;
    const validStatusValues = ['ACTIVE', 'PAUSED', 'CANCELED', 'SUSPENDED'];
    const { subscription_id, status } = req.body;

    console.log(req.body);
    if (!validStatusValues.includes(status)) {
        res.status(400).send('Invalid status value');
        return;
    }

    // Получить user_id из таблицы users

    const userQueryResult = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userQueryResult.error) {
        console.error('Error fetching user:', userQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    if (!userQueryResult.data || userQueryResult.data.length === 0) {
        res.status(404).send('User Not Found');
        return;
    }

    const user_id = userQueryResult.data[0].id;

    const actionsQueryResult = await supabase
        .from('user_subscriptions')
        .upsert(
            {
                user_id: user_id,
                subscription_id: subscription_id,
                status: status
            }
            , { ignoreDuplicates: false, onConflict: 'user_id, subscription_id' })

    if (actionsQueryResult.error) {
        console.error('Error upserting data:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }

    console.log(actionsQueryResult);
    res.json(actionsQueryResult);
});

//LOCATIONS

app.get('/locations', async (req, res) => {
    // #swagger.tags = ['Locations']
    const { data, error } = await supabase
        .from('locations')
        .select('*');

    if (error) {
        console.error('Error fetching locations:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.get('/locations/nearest', async (req, res) => {

    // #swagger.tags = ['Locations']
    const { lat, lon } = req.query;
    if (!lat || !lon) {
        return res.status(400).send('Latitude and Longitude are required');
    }

    try {
        const { data, error } = await supabase.rpc('find_nearest_location', { p_lat: parseFloat(lat), p_lon: parseFloat(lon) });
        if (error) {
            console.error(error);
            res.status(500).send('Server Error');
        } else {
            res.json(data[0]);
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

app.post('/locations/unlock', async (req, res) => {
    // #swagger.tags = ['Locations']
    const { loc_id } = req.body;  // Получаем loc_id из тела запроса

    // Проверяем, что loc_id действительно представляет собой строку и не пустой
    if (!loc_id || typeof loc_id !== 'string' || loc_id.trim() === '') {
        return res.status(400).send('Неверный формат loc_id');
    }

    try {
        await toggleDevice(process.env.DOOR_SENSOR_ID, true, loc_id);  // Запускаем функцию toggleDevice с loc_id
        res.status(200).send('Устройство успешно переключено');
    } catch (error) {
        console.error('Ошибка при переключении устройства:', error);
        res.status(500).send('Ошибка сервера');
    }
});

//GOODS

app.get('/goods', async (req, res) => {
    // #swagger.tags = ['Goods']
    const { data, error } = await supabase
        .from('goods')
        .select('*')
        .eq('deleted', 'false')

    if (error) {
        console.error('Error fetching goods:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.post('/goods', async (req, res) => {

    // #swagger.tags = ['Goods']
    const { name, description, price, type } = req.body;

    if (!name || !description || !price || !type) {
        res.status(400).send('Bad Request: Missing required fields');
        return;
    }

    const { error: insertError } = await supabase
        .from('goods')
        .insert([{ name, description, price, type }]);
    if (insertError) {
        console.error('Error creating goods:', insertError);
        if (insertError.code === '23505') {
            res.status(409).send('Conflict: Good with this name already exists');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }

    const { data, error: selectError } = await supabase
        .from('goods')
        .select('*')
        .eq('name', name);
    if (selectError) {

        console.error('Error fetching goods:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(201).json(data[0]);
});


app.patch('/goods/:id', async (req, res) => {

    // #swagger.tags = ['Goods']
    const { name, description, price, type, deleted } = req.body;
    const id = req.params.id;

    const { error: updateError } = await supabase
        .from('goods')
        .update({ name, description, price, type, deleted })
        .eq('id', id);

    if (updateError) {
        console.error('Error updating Goods:', updateError);
        res.status(500).send('Internal Server Error');
        return;
    }


    const { data, error: selectError } = await supabase
        .from('goods')
        .select('*')
        .eq('id', id);
    if (selectError) {

        console.error('Error fetching Goods:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(201).json(data[0]);
});

app.delete('/goods/:id', async (req, res) => {
    // #swagger.tags = ['Goods']
    const id = req.params.id;

    const { error: deleteError } = await supabase
        .from('goods')
        .delete()
        .eq('id', id);

    if (deleteError) {
        console.error('Error deleting subscription:', deleteError);
        if (deleteError.code === '23503') {
            console.error(deleteError.details);
            res.status(409).send('Conflict: Subscription is still referenced in another table');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }


    res.status(204).send();
});


app.post('/goods/buy/userbalance', async (req, res) => {
    // #swagger.tags = ['Goods']
    const { telegram_id, goods_id, quantity } = req.body;

    if (!telegram_id || !goods_id) {
        return res.status(400).send('telegram_id and goods_id are required');
    }



    async function buyGoods(telegramId, goodsId, quantity) {
        try {

            const { data, error } = await supabase.rpc('buy_product_balance', {
                p_telegram_id: telegramId,
                p_product_id: goodsId,
                quantity: quantity,

            });

            if (error) {
                console.error('Ошибка:', error);
                return null;
            }

            return data;
        } catch (err) {
            console.error('Произошла ошибка при вызове функции:', err);
            return null;
        }
    }

    buyGoods(telegram_id, goods_id, quantity).then(response => {
        console.log('Response:', response);

        // Если response равен null, значит произошла ошибка, и мы отправляем статус 500
        if (response === null) {
            return res.status(500).send('INTERNAL_SERVER_ERROR');
        }

        if (response === 'Product not found') {
            return res.status(404).send('PRODUCT_NOT_FOUND');
        }

        if (response === 'User not found') {
            return res.status(404).send('USER_NOT_FOUND');
        }

        if (response === 'Insufficient balance') {
            return res.status(400).send('INSUFFICIENT_BALANCE');
        }

        // Отправляем ответ обратно клиенту
        res.json(response);
    });
});

//TRAINERS

app.get('/trainers', async (req, res) => {
    // #swagger.tags = ['Trainers']
    const { data, error } = await supabase
        .from('trainers')
        .select('*')
        .is('deleted', false)

    if (error) {
        console.error('Error fetching trainers:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.post('/trainers', async (req, res) => {

    // #swagger.tags = ['Trainers']
    const { user_id, first_name, last_name, phone } = req.body;

    if (!user_id || !first_name || !last_name || !phone) {
        res.status(400).send('Bad Request: Missing required fields');
        return;
    }

    const { error: insertError } = await supabase
        .from('trainers')
        .insert([{ user_id, first_name, last_name, phone }]);
    if (insertError) {
        console.error('Error creating trainer:', insertError);
        if (insertError.code === '23505') {
            res.status(409).send('Conflict: Trainer with this user_id already exists');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }

    const { data, error: selectError } = await supabase
        .from('trainers')
        .select('*')
        .eq('user_id', user_id);
    if (selectError) {

        console.error('Error fetching trainer:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(201).json(data[0]);
});


app.patch('/trainer/:user_id', async (req, res) => {

    // #swagger.tags = ['Trainers']
    const { first_name, last_name, phone } = req.body;
    const user_id = req.params.user_id;

    const { error: updateError } = await supabase
        .from('trainers')
        .update({ first_name, last_name, phone })
        .eq('user_id', user_id);

    if (updateError) {
        console.error('Error updating trainers:', updateError);
        res.status(500).send('Internal Server Error');
        return;
    }


    const { data, error: selectError } = await supabase
        .from('trainers')
        .select('*')
        .eq('user_id', user_id);
    if (selectError) {

        console.error('Error fetching trainers:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(201).json(data[0]);
});

app.delete('/trainers/:user_id', async (req, res) => {
    // #swagger.tags = ['Trainers']
    const user_id = req.params.user_id;

    const { error: deleteError } = await supabase
        .from('trainers')
        .delete()
        .eq('user_id', user_id);

    if (deleteError) {
        console.error('Error deleting trainer:', deleteError);

        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(204).send();
});

//SUBSCRIPTIONS

app.get('/subscriptions', async (req, res) => {
    // #swagger.tags = ['Subscriptions']
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('deleted', 'false')

    if (error) {
        console.error('Error fetching locations:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.post('/subscriptions', async (req, res) => {

    // #swagger.tags = ['Subscriptions']
    const { name, code, price, duration } = req.body;

    if (!name || !code || !price || !duration) {
        res.status(400).send('Bad Request: Missing required fields');
        return;
    }

    const { error: insertError } = await supabase
        .from('subscriptions')
        .insert([{ name, code, price, duration }]);
    if (insertError) {
        console.error('Error creating subscription:', insertError);
        if (insertError.code === '23505') {
            res.status(409).send('Conflict: Subscription with this name already exists');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }

    const { data, error: selectError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('name', name);
    if (selectError) {

        console.error('Error fetching subscription:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(201).json(data[0]);
});

app.patch('/subscriptions/:id', async (req, res) => {

    // #swagger.tags = ['Subscriptions']
    const { name, code, price, duration, deleted } = req.body;
    const id = req.params.id;

    const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ name, code, price, duration, deleted })
        .eq('id', id);

    if (updateError) {
        console.error('Error updating subscription:', updateError);
        res.status(500).send('Internal Server Error');
        return;
    }


    const { data, error: selectError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', id);
    if (selectError) {

        console.error('Error fetching subscription:', selectError);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.status(201).json(data[0]);
});

app.delete('/subscriptions/:id', async (req, res) => {
    // #swagger.tags = ['Subscriptions']
    const id = req.params.id;

    const { error: deleteError } = await supabase
        .from('subscriptions')
        .delete()
        .eq('id', id);

    if (deleteError) {
        console.error('Error deleting subscription:', deleteError);
        if (deleteError.code === '23503') {
            console.error(deleteError.details);
            res.status(409).send('Conflict: Subscription is still referenced in another table');
            return;
        }
        res.status(500).send('Internal Server Error');
        return;
    }


    res.status(204).send();
});


app.post('/subscriptions/buy/userbalance', async (req, res) => {
    // #swagger.tags = ['Subscriptions']
    // #swagger.parameters['negative_allowed'] = {in: 'body', description: 'Allow negative balance', type: 'boolean' }
    const { telegram_id, subscription_id, negative_allowed } = req.body;

    if (!telegram_id || !subscription_id) {
        return res.status(400).send('telegram_id and subscription_id are required');
    }

    const userData = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)
        .single()

    if (userData.error) {
        console.error('Error fetching user:', error);
        res.status(404).send('USER_NOT_FOUND');
        return;
    }

    const user_id = userData.data.id

    const actionsQueryResult = await supabase
        .from('user_subscriptions')
        .select("*")
        .eq('user_id', user_id)
        .eq('subscription_id', subscription_id)
        .order('finish', { ascending: false })
        .limit(1)
        .single()

if (actionsQueryResult.error) {
        console.error('Error fetching user subscriptions:', actionsQueryResult.error);
       
    }
console.log(actionsQueryResult.data);
    if (actionsQueryResult?.data?.subscription_id === subscription_id && actionsQueryResult?.data?.status === 'ACTIVE') {
        res.status(400).send('ALREADY_HAVE_ACTIVE_SUBSCRIPTION');
        return;
    }

    const timestampValue =  new Date().toISOString();




    async function buySubscription(user_id, subscriptionId) {
        try {

            const { data, error } = await supabase.rpc(negative_allowed ? 'activate_subscription_negative_balance' : 'activate_subscription_positive_balance', {
                p_start_date: timestampValue,
                p_user_id: user_id,
                p_subscription_id: subscriptionId,
            });

            if (error) {
                console.error('Ошибка:', error);
                return null;
            }
            if (data === "Subscription activated" || data === "Subscription activated negative balance") {

                const { data: subscriptionData } = await supabase
                    .from('user_subscriptions')
                    .select('*, subscriptions (*)')
                    .eq('user_id', user_id)
                    .eq('subscription_id', subscriptionId)
                    .limit(1)
                    .single()

                const { data: balanceData } = await supabase
                    .from('balance')
                    .select('*')
                    .eq('user_id', user_id)
                    .limit(1)
                    .single()


                return (
                    {
                        "status": "SUCCESS",
                        "subscription": subscriptionData,
                        "user_id": user_id,
                        "user": userData.data,
                        "user_balance": balanceData,
                        "negative_allowed": negative_allowed
                    }
                );
            };

        } catch (err) {
            console.error('Произошла ошибка при вызове функции:', err);
            return null;
        }
    }

    buySubscription(user_id, subscription_id).then(response => {
        console.log('Response:', response);



        // Если response равен null, значит произошла ошибка, и мы отправляем статус 500
        if (response === null) {
            return res.status(500).send('INTERNAL_SERVER_ERROR');
        }

        if (response === 'Subscription not found') {
            return res.status(404).send('SUBSCRIPTION_NOT_FOUND');
        }

        if (response === 'User not found') {
            return res.status(404).send('USER_NOT_FOUND');
        }

        if (response === 'Insufficient balance') {
            return res.status(400).send('INSUFFICIENT_BALANCE');
        }

        // Отправляем ответ обратно клиенту
        res.json(response);
    });
});


//ORDERS

app.post('/orders/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Orders']
    const telegram_id = req.params.telegram_id;
    const { amount } = req.body;

    // Проверка входных данных
    if (!amount || isNaN(amount) || amount <= 0) {
        res.status(400).send('Bad Request: Invalid amount');
        return;
    }

    // Получить user_id из таблицы users
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userError || !userData || userData.length === 0) {
        console.error('Error fetching user:', userError || 'User not found');
        res.status(500).send('Internal Server Error');
        return;
    }

    const user_id = userData[0].id;

    // Создать новую запись в таблице orders и получить данные созданного заказа
    const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{ user_id, amount, status: 'NEW' }])
        .select();

    if (orderError) {
        console.error('Error creating order:', orderError);
        res.status(500).send('Internal Server Error');
        return;
    }

    // Отправляем данные созданного заказа в ответе
    res.status(201).json(orderData);
});

app.get('/orders/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Orders']
    const telegram_id = req.params.telegram_id;




    // Получить user_id из таблицы users
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id);

    if (userError || !userData || userData.length === 0) {
        console.error('Error fetching user:', userError || 'User not found');
        res.status(500).send('Internal Server Error');
        return;
    }

    const user_id = userData[0].id;

    // Прочесть запись в таблице orders и получить данные созданного заказа
    const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select()
        .eq('user_id', user_id)

    if (orderError) {
        console.error('Error fetching order:', orderError);
        res.status(500).send('Internal Server Error');
        return;
    }

    // Отправляем данные созданного заказа в ответе
    res.status(200).json(orderData);
});

//PAYMENTS

app.post('/payment/tinkoff/init', async (req, res) => {
    // #swagger.tags = ['Payments']
    const ordernumber = req.body.order_number;


    // Прочесть запись в таблице orders и получить данные созданного заказа
    const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*, users (*)')
        .eq('number', ordernumber)
    console.log(orderData);
    // Инициализируем платеж Тинькофф
    const terminalKey = process.env.TINKOFF_TERMINAL_KEY;
    const amount = orderData[0].amount * 100; // В копейках
    const orderId = ordernumber;
    const merchantPassword = process.env.TINKOFF_PASSWORD; // Пароль мерчанта
    const notificationURL = 'https://api.mygym.world/webhooks/tinkoff/notifications';
    const customerKey = orderData[0].users.telegram_id;

    const paymentInitResult = await initPayment(notificationURL, terminalKey, amount, orderId, merchantPassword, customerKey)

    // Создать новую запись в таблице orders и получить данные созданного заказа
    const { data: orderResultData, error: orderResultError } = await supabase
        .from('orders')
        .update([{ status: 'PENDING' }])
        .eq('number', ordernumber)
        .select();

    if (orderError) {
        console.error('Error creating order:', orderError);
        res.status(500).send('Internal Server Error');
        return;
    }

    // Отправляем данные созданного заказа в ответе
    res.json(paymentInitResult);
});

//WEBHOOKS

app.post('/webhooks/tinkoff/notifications', async (req, res) => {
    // #swagger.tags = ['Webhooks']
    const ordernumber = req.body.OrderId;
    const status = req.body.Status;
    console.log(req.body);
    if (status === 'CONFIRMED') {

        // Обновить запись в таблице orders и получить данные созданного заказа
        const { data: orderResultData, error: orderResultError } = await supabase
            .from('orders')
            .update([{ status: 'COMPLETE' }])
            .eq('number', ordernumber)
            .select();

        const user_id = orderResultData[0].user_id;
        const amount = orderResultData[0].amount;

        // Получить запись из таблицы users по user_id
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user_id);

        if (userError || !userData || userData.length === 0) {
            console.error('Error fetching user:', userError || 'User not found');
            res.status(500).send('Internal Server Error');
            return;
        }

        const telegram_id = userData[0].telegram_id;
        console.log(userData);


        // Создать новую запись в таблице transactions
        const { error: transactionError } = await supabase
            .from('transactions')
            .insert([{ user_id, amount, type: 'DEP' }]);

        if (transactionError) {
            console.error('Error creating transaction:', transactionError);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Проверьте, существует ли запись balance для user_id
        const { data: balanceData, error: balanceCheckError } = await supabase
            .from('balance')
            .select('user_id')
            .eq('user_id', user_id);

        if (balanceCheckError || !balanceData || balanceData.length === 0) {
            const { error: balanceCreateError } = await supabase
                .from('balance')
                .insert([{ user_id, amount }]);

            if (balanceCreateError) {
                console.error('Error creating balance:', balanceCreateError);
                res.status(500).send('Internal Server Error');
                return;
            }
        } else {
            // Обновите запись в таблице balance для user_id, если запись уже существует
            const { error: balanceUpdateError } = await supabase
                .rpc('update_balance', { p_user_id: Number(user_id), p_amount: Number(amount) });

            if (balanceUpdateError) {
                console.error('Error updating balance:', balanceUpdateError);
                res.status(500).send('Internal Server Error');
                return;
            }
        }

        const { data: newBalanceData, error: newBalanceCheckError } = await supabase
            .from('balance')
            .select('*')
            .eq('user_id', user_id);
        const newAmount = newBalanceData[0].amount;
        console.log(newAmount);

        // Замените эти значения на актуальные данные
        const body = {
            telegram_id: telegram_id,
            message: 'Платеж успешно завершен. Ваш баланс пополнен на ' + amount + ' ₽. Всего на балансе ' + newAmount + ' ₽.'
        };
        const url = 'https://hook.eu2.make.com/86pyo5ltmxubmsovwxq4aiqzq6ni6tcy';
        const headers = { 'Content-Type': 'application/json' };

        // Вызов функции с использованием async/await
        (async () => {
            try {
                const response = await sendPostMessage(body, url, headers);
                console.log("Data from POST response:", response);
            } catch (error) {
                console.error("Failed to send POST request:", error);
            }
        })();

    }

    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`App is running on http://localhost:${port}/doc`);
});