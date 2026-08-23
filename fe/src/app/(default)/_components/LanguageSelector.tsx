export function LanguageSelector() {
  return (
    <div className="flex flex-1 justify-end">
      <label className="sr-only" htmlFor="language-selector">
        Language
      </label>
      <select
        id="language-selector"
        className="focus-ring min-h-touch rounded-pill border border-border bg-surface px-control-x text-label font-medium text-foreground shadow-control"
        defaultValue="English"
        aria-label="Language"
      >
        <option>English</option>
      </select>
    </div>
  );
}
