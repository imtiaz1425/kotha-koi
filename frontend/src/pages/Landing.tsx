import styles from './Landing.module.css'

export default function Landing() {
  return (
    <main className={styles.hero}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.badge}>🎓 UIU Students Only</div>

        <h1 className={styles.title}>
          Meet someone new,<br />
          <span className={styles.gradient}>anonymously.</span>
        </h1>

        <p className={styles.subtitle}>
          KothaKoi connects you with a random fellow student for a real,
          unfiltered conversation. No profiles. No followers. Just talk.
        </p>

        <div className={styles.actions}>
          <a href="/chat" className={styles.btnPrimary} id="start-chat-btn">
            Start Chatting
          </a>
          <a href="#how-it-works" className={styles.btnSecondary} id="how-it-works-link">
            How it works
          </a>
        </div>
      </div>

      {/* Decorative blobs */}
      <div className={styles.blob1} aria-hidden="true" />
      <div className={styles.blob2} aria-hidden="true" />
    </main>
  )
}
