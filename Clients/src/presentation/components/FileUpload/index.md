# FileUpload Component

The FileUpload component is designed to handle file uploads with various features such as drag and drop, file size validation, and file type validation. It also provides a UI to display uploaded files and allows for their removal.

## Properties

- `onSuccess`: A callback function to be executed when a file upload is successful.
- `onError`: A callback function to be executed when a file upload fails.
- `onStart`: A callback function to be executed when a file upload starts.
- `allowedFileTypes`: An array of file types that are allowed for upload. Defaults to `["application/pdf"]`.
- `maxFileSize`: The maximum size of a file that can be uploaded in bytes. Defaults to `5MB`.
- `onHeightChange`: A callback function to be executed when the height of the component needs to be adjusted based on the number of uploaded files.

## Usage

To use the FileUpload component, simply import it and pass the required properties as needed. Here's an example:

```jsx
import FileUpload from "./FileUpload";

const App = () => {
  return (
    <FileUpload
      onSuccess={(file) => console.log(`File ${file.name} uploaded successfully.`)}
      onError={(error) => console.error(`Upload error: ${error}`)}
      onStart={() => console.log("Upload started")}
      allowedFileTypes={["application/pdf"]}
      maxFileSize={5 * 1024 * 1024}
      onHeightChange={(height) => console.log(`Component height adjusted to ${height}px.`)}
    />
  );
};
```

This will render a FileUpload component with the specified properties, allowing users to upload files and handling the upload process accordingly.

## Customization

The FileUpload component allows for customization through the `onSuccess`, `onError`, `onStart`, `allowedFileTypes`, `maxFileSize`, and `onHeightChange` properties. You can pass any valid callback functions, file types, and file size to this component to change its behavior.

## Features

- Supports drag and drop file uploads.
- Validates file size against a maximum limit.
- Validates file type against a list of allowed types.
- Displays uploaded files with their names and sizes.
- Allows for the removal of uploaded files.
- Dynamically adjusts its height based on the number of uploaded files.
- Supports custom callback functions for success, error, and start events.
- Supports custom file types and file size limits.
