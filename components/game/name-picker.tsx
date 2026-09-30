"use client";

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { matchesParticipant, participantLabel, participantValue, sameParticipant, type Person } from "@/lib/game-types";

export function NamePicker({ people, selected, onSelect, onOpenChange }: { people: Person[]; selected: Person | null; onSelect: (person: Person | null) => void; onOpenChange: (open: boolean) => void }) {
  return <Combobox items={people} value={selected} onValueChange={onSelect}
    itemToStringLabel={participantLabel} itemToStringValue={participantValue}
    isItemEqualToValue={sameParticipant} filter={matchesParticipant} autoHighlight
    onOpenChange={onOpenChange}
    onInputValueChange={(value, details) => {
      if (details.reason === "input-change" && selected && value !== selected.name) onSelect(null);
    }}>
    <ComboboxInput id="guess-name" placeholder="Escribe y elige un nombre…" className="name-combobox" autoComplete="off" showClear />
    <ComboboxContent className="name-popover"><ComboboxEmpty>No encontramos ese nombre.</ComboboxEmpty>
      <ComboboxList>{(person: Person) => <ComboboxItem className="name-option" key={person.id} value={person}><span>{person.name.slice(0, 1).toUpperCase()}</span>{person.name}</ComboboxItem>}</ComboboxList>
    </ComboboxContent>
  </Combobox>;
}
