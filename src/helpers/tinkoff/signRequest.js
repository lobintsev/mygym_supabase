const crypto = require('crypto');

function signRequest(requestBody, merchantPassword) {
  // Логируем начальные данные запроса
  console.log("Original Request Body:", requestBody);

  // Исключаем вложенные объекты и массивы, оставляем только параметры корневого объекта
  const dataToSign = Object.keys(requestBody)
    .filter(key => typeof requestBody[key] !== 'object')
    .reduce((obj, key) => {
      obj[key] = requestBody[key];
      return obj;
    }, {});

  // Добавляем пароль мерчанта
  dataToSign.Password = merchantPassword;

  // Логируем данные до сортировки
  console.log("Data before sorting:", dataToSign);

  // Сортируем данные по ключу
  const sortedData = Object.keys(dataToSign).sort().reduce((obj, key) => {
    obj[key] = dataToSign[key];
    return obj;
  }, {});

  // Логируем отсортированные данные
  console.log("Sorted Data:", sortedData);

  // Конкатенируем значения в одну строку
  const concatenatedValues = Object.values(sortedData).join('');

  // Логируем конкатенированную строку
  console.log("Concatenated Values:", concatenatedValues);

  // Применяем хеш-функцию SHA-256
  const hash = crypto.createHash('sha256').update(concatenatedValues).digest('hex');

  // Логируем хеш
  console.log("SHA-256 Hash:", hash);

  return hash;
  
}

module.exports = signRequest;
