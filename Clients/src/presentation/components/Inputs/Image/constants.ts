export const checkImage = (url: any) => {
  const img = new Image();
  img.src = url;
  return img.naturalWidth !== 0;
};

export const TextFieldStyles = {
  "width": "100%",
  "& .MuiInputBase-input[type='file']": {
    opacity: 0,
    cursor: "pointer",
    maxWidth: "500px",
    minHeight: "175px",
  },
  "& fieldset": {
    padding: 0,
    border: "none",
  },
};

export const IconButtonStack = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: "-1",
  width: "100%",
};
