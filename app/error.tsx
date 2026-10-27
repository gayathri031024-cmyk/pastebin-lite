"use client";

export default function ErrorPage() {
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <p>The paste could not be loaded right now. Please try again shortly.</p>
      <a href="/">Create a new paste</a>
    </div>
  );
}
