import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface File {
  id: string;
  name: string;
  type: string;
  uploadDate: string;
  uploader: string;
}

interface FileState {
  files: File[];
}

const initialState: FileState = {
  files: [],
};

const fileSlice = createSlice({
  name: "files",
  initialState,
  reducers: {
    addFile: (state, action: PayloadAction<File>) => {
      state.files.push(action.payload);
    },
    removeFile: (state, action: PayloadAction<string>) => {
      state.files = state.files.filter((file) => file.id !== action.payload);
    },
  },
});

export const { addFile, removeFile } = fileSlice.actions;
export default fileSlice.reducer;
