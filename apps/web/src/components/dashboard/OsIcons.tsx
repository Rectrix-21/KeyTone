export function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 88"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 12.4 35.8 7.5V42H0Z" />
      <path d="M40 6.9 88 0V42H40Z" />
      <path d="M0 46H35.8V80.6L0 75.6Z" />
      <path d="M40 46H88V88L40 81.1Z" />
    </svg>
  );
}

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 384 512"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 0 184.4 0 272.8c0 26.2 4.8 53.3 14.4 81.3 12.8 37 59 127.6 107.2 126.1 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-83 102.6-120.1-65.2-30.7-57.7-90-57.7-91.4zM256.4 88.9c27.5-32.4 25-61.9 24.2-72.5-24.3 1.4-52.4 16.4-68.5 35-17.8 19.8-28.3 44.3-26 71.9 26.2 2 50-11.1 70.3-34.4z" />
    </svg>
  );
}
