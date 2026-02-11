import React from 'react';

export const DrawerContext = React.createContext<{ open: () => void }>({
  open: () => {},
});
