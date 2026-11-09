//! Which backend the client talks to.
//!
//! Defaults to the official servers. A self-hosted, API-compatible server can
//! be selected at runtime ([`set_server_config`]); REST, WebSocket and the
//! media-host allowlist all read from here, so switching needs no rebuild.
//! Only one client is active at a time (account switches rebuild it), so a
//! process-wide setting is enough.

use std::net::IpAddr;
use std::sync::{Arc, LazyLock, RwLock};

use serde::{Deserialize, Serialize};
use wreq::Url;

use crate::error::GrindrError;

pub(crate) const OFFICIAL_API_BASE: &str = "https://grindr.mobi";
const OFFICIAL_WS_URL: &str = "wss://grindr.mobi/v1/ws";

/// A backend: the official one, or a self-hosted server identified by its
/// API base URL (and optionally a separate media origin).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ServerConfig {
	/// The official servers (grindr.mobi, cdns.grindr.com, CloudFront).
	#[default]
	Official,
	/// A self-hosted, API-compatible server.
	#[serde(rename_all = "camelCase")]
	Custom {
		/// e.g. `https://api.example.org`, no trailing slash, no path.
		api_base: String,
		/// Origin serving `/images/...` and signed media; defaults to `api_base`.
		#[serde(default, skip_serializing_if = "Option::is_none")]
		media_base: Option<String>,
	},
}

impl ServerConfig {
	/// Validates and normalizes a user-entered server URL.
	///
	/// `https` is required, except for loopback and private-network hosts
	/// (local development), where `http` is allowed too.
	pub fn custom(api_base: &str, media_base: Option<&str>) -> Result<Self, GrindrError> {
		let api_base = normalize_origin(api_base)?;
		let media_base = media_base
			.filter(|m| !m.trim().is_empty())
			.map(normalize_origin)
			.transpose()?;
		Ok(Self::Custom { api_base, media_base })
	}

	/// Whether this is the official backend.
	pub fn is_official(&self) -> bool {
		matches!(self, Self::Official)
	}

	/// REST origin, e.g. `https://grindr.mobi`.
	pub fn api_base(&self) -> &str {
		match self {
			Self::Official => OFFICIAL_API_BASE,
			Self::Custom { api_base, .. } => api_base,
		}
	}

	/// WebSocket endpoint (`/v1/ws`) derived from the API origin.
	pub fn ws_url(&self) -> String {
		match self {
			Self::Official => OFFICIAL_WS_URL.to_owned(),
			Self::Custom { api_base, .. } => {
				let ws = if let Some(rest) = api_base.strip_prefix("https://") {
					format!("wss://{rest}")
				} else if let Some(rest) = api_base.strip_prefix("http://") {
					format!("ws://{rest}")
				} else {
					api_base.clone()
				};
				format!("{ws}/v1/ws")
			}
		}
	}

	/// The media origin of a custom server (`None` for the official one).
	pub fn media_base(&self) -> Option<&str> {
		match self {
			Self::Official => None,
			Self::Custom {
				api_base,
				media_base,
			} => Some(media_base.as_deref().unwrap_or(api_base)),
		}
	}

	/// Whether `url` points at this custom server's media origin.
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

fn is_local_host(host: &str) -> bool {
	if host.eq_ignore_ascii_case("localhost") {
		return true;
	}
	let host = host.trim_start_matches('[').trim_end_matches(']');
	match host.parse::<IpAddr>() {
		Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || ip.is_link_local(),
		Ok(IpAddr::V6(ip)) => ip.is_loopback() || (ip.segments()[0] & 0xfe00) == 0xfc00,
		Err(_) => false,
	}
}

fn normalize_origin(input: &str) -> Result<String, GrindrError> {
	let trimmed = input.trim().trim_end_matches('/');
	let url = Url::parse(trimmed)
		.map_err(|e| GrindrError::InvalidRequest(format!("invalid server URL: {e}")))?;
	let host = url
		.host_str()
		.ok_or_else(|| GrindrError::InvalidRequest("server URL has no host".to_owned()))?;
	match url.scheme() {
		"https" => {}
		"http" if is_local_host(host) => {}
		"http" => {
			return Err(GrindrError::InvalidRequest(
				"server URL must use https (http is only allowed for local addresses)".to_owned(),
			))
		}
		other => {
			return Err(GrindrError::InvalidRequest(format!(
				"unsupported server URL scheme {other:?}"
			)))
		}
	}
	if url.path() != "/" && !url.path().is_empty() {
		return Err(GrindrError::InvalidRequest(
			"server URL must not contain a path".to_owned(),
		));
	}
	if url.query().is_some() || url.fragment().is_some() || !url.username().is_empty() {
		return Err(GrindrError::InvalidRequest(
			"server URL must be a plain origin".to_owned(),
		));
	}
	let mut origin = format!("{}://{}", url.scheme(), host);
	if let Some(port) = url.port() {
		origin.push_str(&format!(":{port}"));
	}
	Ok(origin)
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
	fn custom_https_normalizes_and_derives_ws() {
		let c = ServerConfig::custom("https://api.example.org/", None).unwrap();
		assert_eq!(c.api_base(), "https://api.example.org");
		assert_eq!(c.ws_url(), "wss://api.example.org/v1/ws");
		assert_eq!(c.media_base(), Some("https://api.example.org"));
	}

	#[test]
	fn http_only_for_local_hosts() {
		assert!(ServerConfig::custom("http://192.168.1.20:8080", None).is_ok());
		assert!(ServerConfig::custom("http://localhost:8080", None).is_ok());
		assert!(ServerConfig::custom("http://10.0.2.2:8080", None).is_ok());
		assert!(ServerConfig::custom("http://example.org", None).is_err());
		let c = ServerConfig::custom("http://localhost:8080", None).unwrap();
		assert_eq!(c.ws_url(), "ws://localhost:8080/v1/ws");
	}

	#[test]
	fn rejects_paths_queries_credentials_and_schemes() {
		assert!(ServerConfig::custom("https://example.org/api", None).is_err());
		assert!(ServerConfig::custom("https://example.org?x=1", None).is_err());
		assert!(ServerConfig::custom("https://u:p@example.org", None).is_err());
		assert!(ServerConfig::custom("ftp://example.org", None).is_err());
		assert!(ServerConfig::custom("not a url", None).is_err());
	}

	#[test]
	fn media_origin_match_is_exact() {
		let c = ServerConfig::custom("https://api.example.org", Some("https://media.example.org")).unwrap();
		let ok = Url::parse("https://media.example.org/1/abc?Expires=1").unwrap();
		assert!(c.is_custom_media_url(&ok));
		for bad in [
			"http://media.example.org/1/abc",
			"https://media.example.org.evil.test/1/abc",
			"https://evilmedia.example.org/1/abc",
			"https://media.example.org:8443/1/abc",
			"https://api.example.org/1/abc",
		] {
			assert!(!c.is_custom_media_url(&Url::parse(bad).unwrap()), "{bad}");
		}
		assert!(!ServerConfig::Official.is_custom_media_url(&ok));
	}

	#[test]
	fn serde_round_trip() {
		let c = ServerConfig::custom("https://api.example.org", None).unwrap();
		let json = serde_json::to_string(&c).unwrap();
		assert_eq!(json, r#"{"kind":"custom","apiBase":"https://api.example.org"}"#);
		assert_eq!(serde_json::from_str::<ServerConfig>(&json).unwrap(), c);
		assert_eq!(
			serde_json::from_str::<ServerConfig>(r#"{"kind":"official"}"#).unwrap(),
			ServerConfig::Official
		);
	}
}
