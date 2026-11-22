export const stringToArray = (str: string): Array<number> => {
  if (str === null || str === "") {
    return [];
  }
  if (str.startsWith("[") && str.endsWith("]")) {
    return JSON.parse(str);
  } else {
    return [parseInt(str)];
  }
};
