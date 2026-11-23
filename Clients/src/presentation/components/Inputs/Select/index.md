# Select Component

The Select component is a custom implementation of Material-UI's Select component. It provides a dropdown list of options for users to select from, with additional features such as placeholder text, error handling, and custom styling.

## Properties

- `id`: The unique identifier for the select input.
- `label`: The label for the select input.
- `placeholder`: The placeholder text for the select input.
- `isHidden`: Flag to determine if the placeholder should be hidden.
- `value`: The current value of the select input.
- `items`: The list of items to display in the select dropdown. An item can set `noTranslate` when its name is the user's own text (a vendor's name, say): the DOM translator then leaves it alone, in the menu and as the selected value.
- `isRequired`: Flag to indicate if the field is required.
- `error`: The error message to display if there is an error.
- `onChange`: The callback function to handle changes in the select input.
- `sx`: Additional styles to apply to the select component.
- `getOptionValue`: The function to get the value of an option.

## Usage

To use the Select component, simply import it and pass the required properties as needed. Here's an example:

```jsx
import Select from "./Select";

const App = () => {
  const [value, setValue] = useState("");

  const handleSelectChange = (event: SelectChangeEvent<string | number>) => {
    setValue(event.target.value);
  };

  return (
    <Select
      id="select-input"
      label="Select an option"
      placeholder="Select an option"
      value={value}
      items={[
        { _id: "1", name: "Option 1" },
        { _id: "2", name: "Option 2" },
        { _id: "3", name: "Option 3" },
      ]}
      onChange={handleSelectChange}
    />
  );
};
```

This will render a Select component with the specified properties, allowing users to interact with the dropdown list and handling the state change accordingly.

## Customization

The Select component allows for customization through its various properties. You can pass any valid values to these properties to change the behavior and appearance of the component.

## Features

- Supports custom styling through Material-UI's theme and sx properties.
- Supports custom error handling through the `error` property.
- Supports custom placeholder text and hiding the placeholder.
- Displays a dropdown list of options with custom styling.
- Supports custom handling of option values through the `getOptionValue` function.
