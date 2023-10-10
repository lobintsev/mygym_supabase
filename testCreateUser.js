const axios = require('axios');

async function testCreateUser() {
    try {
        const response = await axios.post('http://localhost:3000/users', {
            telegram_id: 123453445434343,
            first_name: 'John',
            last_name: 'Doe',
            telegram_nickname: 'john_doe'
        });
        console.log('User created successfully:', response.data);
    } catch (error) {
        console.error('Error creating user:', error.response ? error.response.data : error.message);
    }
}

testCreateUser();