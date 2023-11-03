const express = require('express');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const toggleDevice = require('./toggleDevice');
const swaggerUi = require('swagger-ui-express')
const swaggerFile = require('./swagger_output.json')

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile))

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

//USERS

app.get('/users', async (req, res) => {
    // #swagger.tags = ['Users']
    const { data, error } = await supabase
        .from('users')
        .select('*');

    if (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});

app.post('/users', async (req, res) => {
    // #swagger.tags = ['Users']
    const { telegram_id, first_name, last_name, telegram_nickname, phone } = req.body;  

    if (!telegram_id || !first_name || !last_name ) {
        res.status(400).send('Bad Request: Missing required fields');
        return;
    }

    const { error: insertError } = await supabase
        .from('users')
        .insert([{ telegram_id, first_name, last_name, telegram_nickname, phone }]);  
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

    res.status(201).json(data[0]);  
});



app.get('/users/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id);

    if (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    if (data && data.length > 0) {
        res.json(data[0]); 
    } else {
        res.status(404).send('User Not Found');
    }
});

app.patch('/users/:telegram_id', async (req, res) => {
    // #swagger.tags = ['Users']
    const telegram_id = req.params.telegram_id;
    const { first_name, last_name, telegram_nickname, phone, email } = req.body;

    if (!first_name && !last_name && !telegram_nickname && !phone) {
        res.status(400).send('Bad Request: No fields to update');
        return;
    }

    const { error: updateError } = await supabase
        .from('users')
        .update({ first_name, last_name, telegram_nickname, phone, email })
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

app.post('/users/balance/:telegram_id/deposit', async (req, res) => {
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

res.status(201).send('Deposit successful');
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

app.get('/users/subscriptions/:telegram_id', async (req, res) => {
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
    .from('user_subscriptions')
    .select(`
      *, 
      subscriptions (
        *
      )
    `)
    .eq('user_id', user_id)
    .gte('finish', new Date().toISOString()); 
  
    if (actionsQueryResult.error) {
        console.error('Error fetching balance:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }
  
    res.json(actionsQueryResult.data);
});

app.get('/users/subscriptions/status/:telegram_id', async (req, res) => {
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
    .from('user_subscriptions')
    .select(`
      *, 
      subscriptions (
        *
      )
    `)
    .eq('user_id', user_id)
    .gte('finish', new Date().toISOString()); 

    const hasSubscriptions = actionsQueryResult.data.length > 0;
    res.json(hasSubscriptions);

  
    if (actionsQueryResult.error) {
        console.error('Error fetching balance:', actionsQueryResult.error);
        res.status(500).send('Internal Server Error');
        return;
    }
  
    res.json(hasSubscriptions);
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

//SUBSCRIPTIONS

app.get('/subscriptions', async (req, res) => {
    // #swagger.tags = ['Subscriptions']
    const { data, error } = await supabase
        .from('subscriptions')
        .select('*');

    if (error) {
        console.error('Error fetching locations:', error);
        res.status(500).send('Internal Server Error');
        return;
    }

    res.json(data);
});


app.post('/subscriptions/buy/userbalance', async (req, res) => {
    // #swagger.tags = ['Subscriptions']
    const { telegram_id, subscription_id } = req.body; 

    if (!telegram_id || !subscription_id) {
        return res.status(400).send('telegram_id and subscription_id are required');
    }

    async function buySubscription(telegramId, subscriptionId) {
        try {
            const { data, error } = await supabase.rpc('buy_subscription_balance', {
                p_telegram_id: telegramId,
                p_subscription_id: subscriptionId
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

    buySubscription(telegram_id, subscription_id).then(response => {
        console.log('Response:', response);
        
        // Если response равен null, значит произошла ошибка, и мы отправляем статус 500
        if (response === null) {
            return res.status(500).send('Internal server error');
        }
        
        // Отправляем ответ обратно клиенту
        res.json(response);
    });
});

app.listen(port, () => {
    console.log(`App is running on http://localhost:${port}`);
});