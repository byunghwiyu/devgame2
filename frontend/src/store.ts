import { create } from "zustand";

type AuthState = {
  token: string | null;
  setToken: (token: string | null) => void;
};

const TOKEN_KEY = "inryuk_auth_token";

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  setToken: (token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    set({ token });
  },
}));
