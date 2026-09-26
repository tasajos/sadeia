/** Ícono Material Symbols Outlined (20 px en interfaz). */
export default function Icon({ name, size, color, style, className = '' }) {
  return (
    <span className={`icon ${className}`} aria-hidden="true" style={{ fontSize: size, color, ...style }}>
      {name}
    </span>
  );
}
