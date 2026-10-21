import { notFound } from "next/navigation";

// Any address no page matches gets the app's own 404 page, in Portuguese (US-025).
export default function UnknownPage() {
  notFound();
}
