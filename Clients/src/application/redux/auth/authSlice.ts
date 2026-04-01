import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

const initialState = {
	isLoading: false,
	authToken: "",
	user: "",
	userExists: false,
	success: null as boolean | null,
	message: null as string | null,
	expirationDate: null as number | null,
	onboardingStatus: "completed" as string,
	isOrgCreator: false as boolean,
	isSuperAdmin: false as boolean,
	activeOrganizationId: null as number | null,
};

export const register = createAsyncThunk(
	"user/register",
	async (form, thunkApi) => {
		console.log(form);
		console.log(thunkApi);
	}
);

export const login = createAsyncThunk("user/login", async (form, thunkApi) => {
	console.log(form);
	console.log(thunkApi);
});

export const update = createAsyncThunk(
	"user/update",
	async (form, thunkApi) => {
		console.log(form);
		console.log(thunkApi);
	}
);

export const remove = createAsyncThunk(
	"user/delete",
	async (form, thunkApi) => {
		console.log(form);
		console.log(thunkApi);
	}
);

export const forgotPassword = createAsyncThunk(
	"user/forgotPassword",
	async (form, thunkApi) => {
		console.log(form);
		console.log(thunkApi);
	}
);

export const setNewPassword = createAsyncThunk(
	"user/setNewPassword",
	async (form, thunkApi) => {
		console.log(form);
		console.log(thunkApi);
	}
);

const handleAuthFulfilled = (state: any, action: any) => {
	state.isLoading = false;
	state.success = action.payload.success;
	state.message = action.payload.message;
	state.authToken = action.payload.data.authToken;
	state.user = action.payload.data.user;
};

const handleAuthRejected = (state: any, action: any) => {
	state.isLoading = false;
	state.success = false;
	state.message = action.payload
		? action.payload.message
		: "An error occurred. Please try again later";
};

const handleUpdateFulfilled = (state: any, action: any) => {
	state.isLoading = false;
	state.success = action.payload.success;
	state.message = action.payload.message;
	state.user = action.payload.data;
};

const handleUpdateRejected = (state: any, action: any) => {
	state.isLoading = false;
	state.success = false;
	state.message = action.payload
		? action.payload.message
		: "An error occurred. Please try again later";
};

const handleRemoveFulfilled = (state: any, action: any) => {
	state.isLoading = false;
	state.success = action.payload.success;
	state.message = action.payload.message;
};

const handleRemoveRejected = (state: any, action: any) => {
	state.isLoading = false;
	state.success = false;
	state.message = action.payload
		? action.payload.message
		: "An error occurred. Please try again later";
};

const handleForgotPasswordFulfilled = (state: any, action: any) => {
	state.isLoading = false;
	state.success = action.payload.success;
	state.message = action.payload.message;
};

const handleForgotPasswordRejected = (state: any, action: any) => {
	state.isLoading = false;
	state.success = false;
	state.message = action.payload
		? action.payload.message
		: "An error occurred. Please try again later";
};

const handleNewPasswordRejected = (state: any, action: any) => {
	state.isLoading = false;
	state.success = false;
	state.message = action.payload
		? action.payload.message
		: "An error occurred. Please try again later";
};

const authSlice = createSlice({
	name: "auth",
	initialState,
	reducers: {
		clearAuthState: (state) => {
			state.authToken = "";
			state.userExists = true;
			state.user = "";
			state.isLoading = false;
			state.success = true;
			state.message = "Logged out successfully";
			state.expirationDate = null;
			state.onboardingStatus = "completed";
			state.isOrgCreator = false;
			state.isSuperAdmin = false;
			state.activeOrganizationId = null;
		},
		setAuthToken: (state, action: PayloadAction<string>) => {
			state.authToken = action.payload;

		},
		setExpiration: (state, action: PayloadAction<number | null>) => {
			state.expirationDate = action.payload
		},
		setUserExists: (state, action: PayloadAction<boolean>) => {
			state.userExists = action.payload;
		},
		setOnboardingStatus: (state, action: PayloadAction<string>) => {
			state.onboardingStatus = action.payload;
		},
		setIsOrgCreator: (state, action: PayloadAction<boolean>) => {
			state.isOrgCreator = action.payload;
		},
		setIsSuperAdmin: (state, action: PayloadAction<boolean>) => {
			state.isSuperAdmin = action.payload;
		},
		setActiveOrganizationId: (state, action: PayloadAction<number | null>) => {
			state.activeOrganizationId = action.payload;
		},
	},
	extraReducers(builder) {
		// Register thunk
		builder
			.addCase(register.pending, (state) => {
				state.isLoading = true;
			})
			.addCase(register.fulfilled, (state, action) => {
				handleAuthFulfilled(state, action);
				state.userExists = true; // Set userExists to true after registration
			})
			.addCase(register.rejected, handleAuthRejected);

		// Login thunk
		builder
			.addCase(login.pending, (state) => {
				state.isLoading = true;
			})
			.addCase(login.fulfilled, handleAuthFulfilled)
			.addCase(login.rejected, handleAuthFulfilled);

		// Update thunk
		builder
			.addCase(update.pending, (state) => {
				state.isLoading = true;
			})
			.addCase(update.fulfilled, handleUpdateFulfilled)
			.addCase(update.rejected, handleUpdateRejected);

		// Remove thunk
		builder
			.addCase(remove.pending, (state) => {
				state.isLoading = true;
			})
			.addCase(remove.fulfilled, handleRemoveFulfilled)
			.addCase(remove.rejected, handleRemoveRejected);

		// Forgot password thunk
		builder
			.addCase(forgotPassword.pending, (state) => {
				state.isLoading = true;
			})
			.addCase(forgotPassword.fulfilled, handleForgotPasswordFulfilled)
			.addCase(forgotPassword.rejected, handleForgotPasswordRejected);

		// set new password
		builder
			.addCase(setNewPassword.pending, (state) => {
				state.isLoading = true;
			})
			.addCase(setNewPassword.fulfilled, handleAuthFulfilled)
			.addCase(setNewPassword.rejected, handleNewPasswordRejected);
	},
});

export const { clearAuthState, setAuthToken, setUserExists, setExpiration, setOnboardingStatus, setIsOrgCreator, setIsSuperAdmin, setActiveOrganizationId } =
	authSlice.actions;
export default authSlice.reducer;
