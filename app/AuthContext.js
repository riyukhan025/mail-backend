import { createContext } from 'react';

export const AuthContext = createContext({
  user: null,
  login: () => {},
  logout: () => {},
  language: 'en',
  setLanguage: () => {},
});

// This file is not a route, but lives in the app directory.
// Expo Router will complain if it doesn't have a default export.
// A better long-term solution is to move this file outside of the `app` directory.
export default () => null;