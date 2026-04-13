import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';

const TABLET_BREAKPOINT = 600;

export function useColumns(): number {
  const [columns, setColumns] = useState(() => getColumns());

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setColumns(window.width >= TABLET_BREAKPOINT ? 5 : 2);
    });
    return () => sub.remove();
  }, []);

  return columns;
}

function getColumns(): number {
  const { width } = Dimensions.get('window');
  return width >= TABLET_BREAKPOINT ? 5 : 2;
}
