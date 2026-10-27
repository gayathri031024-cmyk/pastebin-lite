export default function NotFound() {
  return (
    <div role="alert">
      <h2>Paste unavailable</h2>
      <p>This paste does not exist, has expired, or has reached its view limit.</p>
      <a href="/">Create a new paste</a>
    </div>
  );
}
