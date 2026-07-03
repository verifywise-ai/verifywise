import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { InputValues } from "../../interfaces/appStates";

interface InputContextValue {
  inputValues: InputValues;
  setInputValues: Dispatch<SetStateAction<InputValues>>;
}

export const InputContext = createContext<InputContextValue>({
  inputValues: {},
  setInputValues: () => {},
});

export const InputProvider = ({ children }: { children: ReactNode }) => {
  const [inputValues, setInputValues] = useState<InputValues>({});

  const value = useMemo(() => ({ inputValues, setInputValues }), [inputValues, setInputValues]);

  return <InputContext.Provider value={value}>{children}</InputContext.Provider>;
};

export const useInput = () => {
  const context = useContext(InputContext);
  if (!context) {
    throw new Error("useInput must be used within an InputProvider");
  }
  return context;
};
