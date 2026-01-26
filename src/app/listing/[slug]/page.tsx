export const dynamic = "force-dynamic";

export default function ListingPage(props: any) {
  return (
    <div style={{ color: "white", padding: 50 }}>
      <h1>PARAM DEBUG</h1>
      <pre>{JSON.stringify(props, null, 2)}</pre>
    </div>
  );
}
