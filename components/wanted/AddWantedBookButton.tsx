'use client';

import { useState } from 'react';
import { AddWantedBookModal } from './AddWantedBookModal';

export function AddWantedBookButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors inline-flex items-center gap-2"
      >
        <PlusIcon />
        Add Book
      </button>

      {isOpen && <AddWantedBookModal onClose={() => setIsOpen(false)} />}
    </>
  );
}

function PlusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
