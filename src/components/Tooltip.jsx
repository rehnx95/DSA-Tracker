import { cloneElement, useId } from 'react';

function Tooltip({ children, label }) {
  const tooltipId = useId();
  const describedBy = [
    children.props['aria-describedby'],
    tooltipId,
  ].filter(Boolean).join(' ');

  return (
    <span className="app-tooltip-anchor">
      {cloneElement(children, { 'aria-describedby': describedBy })}
      <span id={tooltipId} role="tooltip" className="app-tooltip">
        {label}
      </span>
    </span>
  );
}

export default Tooltip;
