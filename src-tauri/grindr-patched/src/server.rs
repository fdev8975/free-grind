//! Which backend the client talks to: the official servers, or the Free Grind
//! server built into the app next to them.
//!
//! Free Grind's addresses are fixed at build time, like the official ones:
//! `FG_API_URL` and `FG_MEDIA_URL` in the build environment. A build without
//! them has no Free Grind server ([`free_grind_available`] is false). There is
//! no user-entered server. REST, WebSocket and the media-host allowlist all
//! read from here. Only one client is active at a time (account switches
//! rebuild it), so a process-wide setting is enough.

use std::sync::{Arc, LazyLock, RwLock};

use serde::{Deserialize, Serialize};
use wreq::Url;

pub(crate) const OFFICIAL_API_BASE: &str = "https://grindr.mobi";
const OFFICIAL_WS_URL: &str = "wss://grindr.mobi/v1/ws";

/// Free Grind REST/WebSocket origin (`FG_API_URL` at build time).
pub const FREE_GRIND_API_BASE: Option<&str> = option_env!("FG_API_URL");

/// Free Grind media origin (`FG_MEDIA_URL` at build time).
pub const FREE_GRIND_MEDIA_BASE: Option<&str> = option_env!("FG_MEDIA_URL");

/// Placeholder for a build without Free Grind addresses: never resolves.
const UNCONFIGURED: &str = "https://free-grind.invalid";

fn configured(value: Option<&'static str>) -> Option<&'static str> {
	value.map(trimmed).filter(|v| !v.is_empty())
}

/// Whether this build has a Free Grind server (both addresses were set).
pub fn free_grind_available() -> bool {
	configured(FREE_GRIND_API_BASE).is_some() && configured(FREE_GRIND_MEDIA_BASE).is_some()
}

/// The backend: official, or the built-in Free Grind server.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ServerConfig {
	/// The official servers (grindr.mobi, cdns.grindr.com, CloudFront).
	#[default]
	Official,
	/// The Free Grind server. Reads `{"kind":"custom",…}` stored by builds that
	/// still let users type a server address.
	#[serde(alias = "custom")]
	FreeGrind,
}

fn trimmed(origin: &'static str) -> &'static str {
	origin.trim().trim_end_matches('/')
}

impl ServerConfig {
	/// Whether this is the official backend.
	pub fn is_official(&self) -> bool {
		matches!(self, Self::Official)
	}

	/// REST origin, e.g. `https://grindr.mobi`.
	pub fn api_base(&self) -> &'static str {
		match self {
			Self::Official => OFFICIAL_API_BASE,
			Self::FreeGrind => configured(FREE_GRIND_API_BASE).unwrap_or(UNCONFIGURED),
		}
	}

	/// WebSocket endpoint (`/v1/ws`).
	pub fn ws_url(&self) -> String {
		match self {
			Self::Official => OFFICIAL_WS_URL.to_owned(),
			Self::FreeGrind => {
				let api = self.api_base();
				let ws = if let Some(rest) = api.strip_prefix("https://") {
					format!("wss://{rest}")
				} else if let Some(rest) = api.strip_prefix("http://") {
					format!("ws://{rest}")
				} else {
					api.to_owned()
				};
				format!("{ws}/v1/ws")
			}
		}
	}

	/// The Free Grind media origin (`None` for the official servers, whose CDNs
	/// are allowlisted separately).
	pub fn media_base(&self) -> Option<&'static str> {
		match self {
			Self::Official => None,
			Self::FreeGrind => Some(configured(FREE_GRIND_MEDIA_BASE).unwrap_or(UNCONFIGURED)),
		}
	}

	/// Whether `url` points at this server's media origin (exact scheme, host and port).
	pub fn is_custom_media_url(&self, url: &Url) -> bool {
		let Some(base) = self.media_base() else {
			return false;
		};
		let Ok(base) = Url::parse(base) else {
			return false;
		};
		url.scheme() == base.scheme()
			&& url.host_str() == base.host_str()
			&& url.port_or_known_default() == base.port_or_known_default()
	}
}

static CURRENT: LazyLock<RwLock<Arc<ServerConfig>>> =
	LazyLock::new(|| RwLock::new(Arc::new(ServerConfig::Official)));

/// The backend every new request and WebSocket connection uses.
pub fn server_config() -> Arc<ServerConfig> {
	CURRENT
		.read()
		.unwrap_or_else(|poisoned| poisoned.into_inner())
		.clone()
}

/// Switches the backend. Callers rebuild/sign out the client around this so
/// no session of one server is ever sent to another.
pub fn set_server_config(config: ServerConfig) {
	*CURRENT
		.write()
		.unwrap_or_else(|poisoned| poisoned.into_inner()) = Arc::new(config);
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn official_is_default() {
		let c = ServerConfig::default();
		assert_eq!(c.api_base(), "https://grindr.mobi");
		assert_eq!(c.ws_url(), "wss://grindr.mobi/v1/ws");
		assert!(c.media_base().is_none());
	}

	#[test]
	fn free_grind_uses_build_time_hosts() {
		let c = ServerConfig::FreeGrind;
		match configured(FREE_GRIND_API_BASE) {
			Some(api) => assert_eq!(c.api_base(), api),
			None => assert_eq!(c.api_base(), UNCONFIGURED),
		}
		assert!(c.ws_url().ends_with("/v1/ws"));
		assert!(c.ws_url().starts_with("ws"));
		assert!(c.media_base().is_some());
	}

	#[test]
	fn media_origin_match_is_exact() {
		let base = Url::parse(ServerConfig::FreeGrind.media_base().unwrap()).unwrap();
		let host = base.host_str().unwrap();
		let ok = Url::parse(&format!("{}/1/abc?Expires=1", base.as_str().trim_end_matches('/'))).unwrap();
		assert!(ServerConfig::FreeGrind.is_custom_media_url(&ok));
		for bad in [format!("https://{host}.evil.test/1/abc"), format!("https://evil{host}/1/abc"), format!("https://{host}:8443/1/abc")] {
			assert!(!ServerConfig::FreeGrind.is_custom_media_url(&Url::parse(&bad).unwrap()), "{bad}");
		}
		assert!(!ServerConfig::Official.is_custom_media_url(&ok));
	}

	#[test]
	fn serde_round_trip_and_legacy_custom() {
		let json = serde_json::to_string(&ServerConfig::FreeGrind).unwrap();
		assert_eq!(json, r#"{"kind":"freeGrind"}"#);
		assert_eq!(serde_json::from_str::<ServerConfig>(&json).unwrap(), ServerConfig::FreeGrind);
		assert_eq!(serde_json::from_str::<ServerConfig>(r#"{"kind":"official"}"#).unwrap(), ServerConfig::Official);
		// Stored by the earlier free-text server selection.
		assert_eq!(
			serde_json::from_str::<ServerConfig>(r#"{"kind":"custom","apiBase":"https://api.example.org"}"#).unwrap(),
			ServerConfig::FreeGrind
		);
	}
}
