import { type ChangeEvent, useState } from "react";

interface CurrencySelectorProps {
  onSelect: (type: "ether" | "token") => void;
}

const CurrencySelector = ({ onSelect }: CurrencySelectorProps) => {
  const [selectedCurrency, setSelectedCurrency] = useState<"ether" | "token">("ether");

  // Don't auto-select ether on mount - this causes issues when switching back from token
  // The parent component should control the initial state instead

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value as "ether" | "token";
    setSelectedCurrency(value);
    onSelect(value);
  };

  return (
    <div className="chooser">
      <span>send</span>
      <input
        type="radio"
        id="ether"
        name="what"
        value="ether"
        checked={selectedCurrency === "ether"}
        onChange={handleChange}
      />
      <label htmlFor="ether">Ether</label>
      <span>or</span>
      <input
        type="radio"
        id="token"
        name="what"
        value="token"
        checked={selectedCurrency === "token"}
        onChange={handleChange}
      />
      <label htmlFor="token">PNK</label>
    </div>
  );
};

export default CurrencySelector;
