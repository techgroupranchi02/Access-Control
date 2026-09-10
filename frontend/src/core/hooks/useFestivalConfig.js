import { useContext } from 'react';
import { FestivalContext } from '../context/FestivalContext';

export function useFestivalConfig() {
  const context = useContext(FestivalContext);
  if (!context) {
    throw new Error('useFestivalConfig must be used within a FestivalProvider');
  }
  return context;
}
