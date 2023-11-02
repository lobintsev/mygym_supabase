const axios = require('axios');

async function testUpdateUser() {
    try {
        // Измените этот ID на ID пользователя, которого вы хотите обновить
        const telegram_id = 123453445434343;
        
        const response = await axios.patch(`http://localhost:3000/users/${telegram_id}`, {
          
            telegram_nickname: 'john_doe_updated55653466543',  // Например, обновите никнейм
            phone: '987-654-3210афывпафывпавппап-150',  // И номер телефона
            email: "gandapas@deee.ri"

        });
        console.log('Response:', response);  // Изменено здесь
    } catch (error) {
        console.error('Error updating user:', error.response ? error.response.data : error.message);
    }
}

testUpdateUser();