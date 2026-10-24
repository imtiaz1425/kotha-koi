import styles from './ChatPlaceholder.module.css'

export default function ChatPlaceholder() {
  return (
    <main className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true">
          💬
        </div>
        <h1 className={styles.title}>Chat Module</h1>
        <p className={styles.desc}>
          This feature is under construction. Check back soon!
        </p>
        <a href="/" className={styles.back} id="back-home-link">
          ← Back to Home
        </a>
      </div>
    </main>
  )
}
