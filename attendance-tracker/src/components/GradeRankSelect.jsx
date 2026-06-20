import { CADET_GRADES, MEMBER_GRADES, SENIOR_GRADES } from '../data/rosterData';

export default function GradeRankSelect({
  value,
  onChange,
  className = 'form-input',
  includeProspective = false,
  id,
}) {
  const showCurrent =
    value && !MEMBER_GRADES.includes(value) && !(includeProspective && value === 'Prospective');

  return (
    <select id={id} className={className} value={value} onChange={onChange}>
      {includeProspective && <option value="Prospective">Prospective</option>}
      {showCurrent && <option value={value}>{value}</option>}
      <optgroup label="Cadet ranks">
        {CADET_GRADES.map((grade) => (
          <option key={grade} value={grade}>
            {grade}
          </option>
        ))}
      </optgroup>
      <optgroup label="Senior member ranks">
        {SENIOR_GRADES.map((grade) => (
          <option key={grade} value={grade}>
            {grade}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
