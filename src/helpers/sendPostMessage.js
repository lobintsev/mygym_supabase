const axios = require('axios');

async function sendPostMessage(body, url, headers) {
  try {
    console.log("Sending POST request to URL:", url);
    console.log("Request body:", body);
    console.log("Request headers:", headers);
    
    const response = await axios.post(url, body, { headers });
  
    console.log("Response received:", response.data);
  
    return response.data;
  } catch (error) {
    // Здесь мы создаем объект с минимальной информацией об ошибке
    const errorInfo = {
      status: error.response?.status, // HTTP статус ответа, если он есть
      data: error.response?.data,     // тело ответа сервера, если оно есть
      message: error.message          // стандартное сообщение об ошибке
    };

    console.error("Error during POST request:", errorInfo);

    // Вместо выбрасывания исключения можно вернуть объект ошибки
    // Если вы хотите вместо этого выбросить исключение, вы можете раскомментировать следующую строку
    // throw errorInfo;

    // Возвращаем ошибку в том виде, в котором она нужна вам
    return errorInfo;
  }
}

module.exports = sendPostMessage;