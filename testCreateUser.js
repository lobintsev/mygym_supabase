const axios = require('axios');

async function testCreateUser() {
    try {
        const response = await axios.post('https://mygymapi.bebopbrands.com/users', {
            telegram_id: 1234342509834345453,
            first_name: 'John',
            last_name: 'Doe'
        });
        console.log(response);
    } catch (error) {
        console.error('Error creating user:', error.response ? error.response.data : error.message);
    }
}

testCreateUser();