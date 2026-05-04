import { createTransform } from "redux-persist";

const authTransform = createTransform(
  (inboundState: any) => {
    const { profileImage: _profileImage, ...rest } = inboundState;
    return rest;
  },
  null,
  {
    whitelist: ["auth"],
  },
);

export default authTransform;
