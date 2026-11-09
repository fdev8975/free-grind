/** Empty gray circle shown on grid tiles in place of the "last online" badge
 * when that's turned off in Appearance — same size as the online dot. */
export function OfflineDot({ title }: { title?: string }) {
	return (
		<span
			className="block h-3 w-3 rounded-full border-2 border-gray-400 shadow-lg ring-2 ring-black/30"
			title={title}
		/>
	);
}
