// Suomalainen käyttäjätunnus, sallii ääkköset
const USERNAME_REGEX = /^[a-zA-ZäöåÄÖÅ0-9_-]{3,20}$/;

// Salasana vähintään 8 merkkiä, iso kirjain, pieni kirjain ja numero
const PASSWORD_REGEX = /^(?=.*[a-zäöå])(?=.*[A-ZÄÖÅ])(?=.*\d).{8,}$/;

function isValidUsername(username) {
  return USERNAME_REGEX.test(username);
}

function isValidPassword(password) {
  return PASSWORD_REGEX.test(password);
}

module.exports = { isValidUsername, isValidPassword };