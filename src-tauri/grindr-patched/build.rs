// The Free Grind server's addresses are compiled in (src/server.rs); rebuild
// when they change.
fn main() {
	println!("cargo:rerun-if-env-changed=FG_API_URL");
	println!("cargo:rerun-if-env-changed=FG_MEDIA_URL");
}
