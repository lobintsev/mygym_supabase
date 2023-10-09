const axios = require('axios');

async function testDeposit() {
    const telegram_id = '12345344543434344';  // Замените на ваш telegram_id
    const depositAmount = 100;  // Сумма депозита

    try {
        const response = await axios.post(`http://localhost:3000/users/balance/${telegram_id}/deposit`, {
            amount: depositAmount
        });
        console.log('Deposit successful:', response.data);
    } catch (error) {
        console.error('Error making deposit:', error.response ? error.response.data : error.message);
    }
}

testDeposit();