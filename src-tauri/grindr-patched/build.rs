// The Free Grind server's addresses are compiled in (src/server.rs); rebuild
// when they change. FG_CA_CERT (optional, test builds only) names a PEM file
// with an extra root CA, e.g. Caddy's `tls internal` root for a local server;
// it's copied into OUT_DIR and compiled in as well.
use std::{env, fs, path::PathBuf};

fn main() {
	println!("cargo:rerun-if-env-changed=FG_API_URL");
	println!("cargo:rerun-if-env-changed=FG_MEDIA_URL");
	println!("cargo:rerun-if-env-changed=FG_CA_CERT");
	let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("fg_ca.pem");
	let pem = match env::var("FG_CA_CERT").ok().filter(|p| !p.trim().is_empty()) {
		Some(path) => {
			println!("cargo:rerun-if-changed={path}");
			let pem = fs::read(&path).unwrap_or_else(|e| panic!("FG_CA_CERT {path}: {e}"));
			assert!(
				String::from_utf8_lossy(&pem).contains("-----BEGIN CERTIFICATE-----"),
				"FG_CA_CERT {path}: not a PEM certificate"
			);
			pem
		}
		None => Vec::new(),
	};
	fs::write(out, pem).expect("write fg_ca.pem");
}
