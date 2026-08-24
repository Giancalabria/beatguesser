import { useEffect, useId, useState } from 'react';
import type { Song } from '../types';

interface SongComboboxProps {
  value: string;
  options: Song[];
  feedbackId: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onSelect: (song: Song) => void;
}

export default function SongCombobox({
  value,
  options,
  feedbackId,
  invalid,
  onChange,
  onSelect,
}: SongComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const visible = open && options.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [options]);

  const select = (song: Song) => {
    setOpen(false);
    setActiveIndex(-1);
    onSelect(song);
  };

  return (
    <div className="relative flex-1 min-w-0">
      <label htmlFor={`${listboxId}-input`} className="sr-only">
        Nombre de la canción
      </label>
      <input
        id={`${listboxId}-input`}
        type="text"
        role="combobox"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && options.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => (index + 1) % options.length);
          } else if (event.key === 'ArrowUp' && options.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
          } else if (event.key === 'Enter' && visible && activeIndex >= 0) {
            event.preventDefault();
            select(options[activeIndex]);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder="¿Qué canción es?"
        className={`w-full h-11 bg-white/5 border rounded-xl px-4 text-sm text-white placeholder:text-neutral-500 focus:outline-none transition-colors ${
          invalid
            ? 'border-expert focus:border-expert'
            : 'border-neutral-700 focus:border-neutral-500'
        }`}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listboxId : undefined}
        aria-activedescendant={
          visible && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-describedby={feedbackId}
        aria-invalid={invalid}
      />

      {visible && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 top-full left-0 right-0 mt-1.5 bg-[#1A1A1A] border border-neutral-700 rounded-xl overflow-hidden shadow-xl max-h-64 overflow-y-auto"
        >
          {options.map((song, index) => (
            <li
              id={`${listboxId}-option-${index}`}
              key={song.id}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-4 py-2.5 text-sm transition-colors ${
                index === activeIndex ? 'bg-neutral-700' : 'hover:bg-neutral-800'
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(song)}
            >
              <span className="text-white">{song.title}</span>
              <span className="text-neutral-500 ml-2">{song.artist}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
