/**
 * @deprecated This component is legacy code. Use VWAvatar instead for new implementations.
 */

import { useEffect, useState, memo } from "react";
import "./index.css";
import { Avatar as MuiAvatar, SxProps, Theme, useTheme } from "@mui/material";

const stringToColor = (string: string) => {
  let hash = 0;
  let i;
  for (i = 0; i < string.length; i += 1) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }

  let color = "#";
  for (i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff;
    color += `00${value.toString(16)}`.slice(-2);
  }

  return color;
};

type User = {
  firstName: string;
  lastName: string;
  avatarImage: string;
};

type AvatarProps = {
  src?: string;
  small?: boolean;
  sx?: SxProps<Theme>;
};

const AvatarComponent = ({ src, small, sx }: AvatarProps) => {
  const theme = useTheme();
  const user: User = {
    firstName: "Mohammad",
    lastName: "Khalilzadeh",
    avatarImage: "../../assets/imgs/profile.jpg",
  };

  const style = small ? { width: 32, height: 32 } : { width: 64, height: 64 };
  const border = small ? 1 : 3;

  const [image, setImage] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (user.avatarImage) {
      setImage(``); // empty string is not a valid URL, but it's just for now
    }
  }, [user?.avatarImage]);

  return (
    <MuiAvatar
      alt={`${user.firstName} ${user.lastName}`}
      src={src ? src : user?.avatarImage ? image : "../../assets/imgs/profile.jpg"}
      sx={{
        "fontSize": small ? theme.typography.body1.fontSize : theme.typography.h6.fontSize,
        "color": theme.palette.common.white,
        "fontWeight": 400,
        "backgroundColor": stringToColor(`${user?.firstName} ${user?.lastName}`),
        "display": "inline-flex",
        "&::before": {
          content: `""`,
          position: "absolute",
          top: 0,
          left: 0,
          width: `100%`,
          height: `100%`,
          border: `${border}px solid rgba(255,255,255,0.2)`,
          borderRadius: "50%",
        },
        ...style,
        ...(sx as object),
      }}
    >
      {user.firstName?.charAt(0)}
      {user.lastName?.charAt(0)}
    </MuiAvatar>
  );
};

const Avatar = memo(AvatarComponent);
export default Avatar;
