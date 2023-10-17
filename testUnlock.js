const axios = require('axios');

async function testUnlock() {
    const loc_id = 'someLocationID123';  // Замените на ваш loc_id

    try {
        const response = await axios.post(`https://mygymapi.bebopbrands.com/locations/unlock`, {
            loc_id: loc_id
        });
        console.log('Device toggled successfully:', response.data);
    } catch (error) {
        console.error('Error toggling device:', error.response ? error.response.data : error.message);
    }
}

testUnlock();