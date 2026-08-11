import { useContext } from "react";
import { ConfigContext } from "../context/ConfigContext";

export const useConfigContext = () => useContext(ConfigContext);
