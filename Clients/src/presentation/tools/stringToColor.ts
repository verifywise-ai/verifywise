export function stringToColor(firstName: string, lastName: string) {
  // hex numbers are 0 1 2 3 4 5 6 7 8 9 A B C D E F
  const lenghtOfFirstName = firstName.length;
  const lenghtOfLastName = lastName.length;

  let firstThreeDigits = "";

  const firstThreeDigitsCounter = lenghtOfFirstName % 10;
  for (let index = firstThreeDigitsCounter; index < 10 && firstThreeDigits.length < 3; index++) {
    firstThreeDigits = firstThreeDigits.concat(index.toString());
  }

  let secondThreeDigits = "";

  const secondThreeDigitsCounter = lenghtOfLastName % 6;
  for (let index = secondThreeDigitsCounter; index < 6; index++) {
    if (index === 6) {
      secondThreeDigits = secondThreeDigits.concat("ABC");
    } else {
      switch (index) {
        case 0:
          secondThreeDigits = secondThreeDigits.concat("A");
          break;
        case 1:
          secondThreeDigits = secondThreeDigits.concat("B");
          break;
        case 2:
          secondThreeDigits = secondThreeDigits.concat("C");
          break;
        case 3:
          secondThreeDigits = secondThreeDigits.concat("D");
          break;
        case 4:
          secondThreeDigits = secondThreeDigits.concat("E");
          break;
        case 5:
          secondThreeDigits = secondThreeDigits.concat("F");
          break;
        default:
          secondThreeDigits = secondThreeDigits.concat(index.toString());
          break;
      }
    }
  }
  return "#" + firstThreeDigits + secondThreeDigits;
}
