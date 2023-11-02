const axios = require('axios');

async function testBuySubscription() {
    try {
        const response = await axios.post('http://localhost:3000/subscriptions/buy/userbalance', {
            telegram_id: 12345,
            subscription_id: 2
        });
        console.log( response.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

testBuySubscription();