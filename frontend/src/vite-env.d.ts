/// <reference types="vite/client" />

// Ambient declaration for CSS Modules.
// Allows TypeScript to accept `import styles from '*.module.css'`
// and treat every imported class name as a string.
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
