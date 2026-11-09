//! The language Grindr's API answers in. The `L-Locale` header (`de_DE`)
//! decides it, sent along with `Accept-Language` (`de-DE`); both follow the
//! app language, which the webview reports through [`set_api_locale`].

use crate::error::AppError;
use crate::state::AppState;

/// `(L-Locale, Accept-Language)` for an app locale such as `"de-DE"`,
/// `"es-419"` or `"sr-Cyrl-RS"`. L-Locale takes Java's `Locale.toString()`
/// shape the Android app sends: language and region joined by `_`, without
/// the script (`sr_RS`). `None` for something that isn't a language tag.
fn api_locale_headers(tag: &str) -> Option<(String, String)> {
    let subtags: Vec<&str> = tag.trim().split(['-', '_']).filter(|s| !s.is_empty()).collect();
    let language = subtags.first()?.to_ascii_lowercase();
    if !(2..=3).contains(&language.len()) || !language.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let region = subtags[1..]
        .iter()
        .find(|s| {
            (s.len() == 2 && s.chars().all(|c| c.is_ascii_alphabetic()))
                || (s.len() == 3 && s.chars().all(|c| c.is_ascii_digit()))
        })
        .map(|s| s.to_ascii_uppercase());
    let script = subtags[1..]
        .iter()
        .find(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_alphabetic()))
        .map(|s| {
            let mut chars = s.chars();
            let first = chars.next().unwrap().to_ascii_uppercase();
            format!("{first}{}", chars.as_str().to_ascii_lowercase())
        });

    let l_locale = match &region {
        Some(region) => format!("{language}_{region}"),
        None => language.clone(),
    };
    let accept_language = [Some(language), script, region]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("-");
    Some((l_locale, accept_language))
}

/// Sets the API language to the app language `locale` (e.g. `"de-DE"`) on
/// the current client and on every one adopted later.
#[tauri::command]
pub async fn set_api_locale(
    state: tauri::State<'_, AppState>,
    locale: String,
) -> Result<(), AppError> {
    let Some((l_locale, accept_language)) = api_locale_headers(&locale) else {
        return Ok(());
    };
    *state.api_locale.write().unwrap() = Some((l_locale.clone(), accept_language.clone()));
    if let Ok(client) = state.client() {
        client
            .set_locale(&l_locale, &accept_language)
            .await
            .map_err(AppError::from)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::api_locale_headers;

    fn headers(tag: &str) -> Option<(&'static str, &'static str)> {
        api_locale_headers(tag).map(|(l, a)| (&*Box::leak(l.into_boxed_str()), &*Box::leak(a.into_boxed_str())))
    }

    #[test]
    fn maps_app_locales_to_api_headers() {
        assert_eq!(headers("en-US"), Some(("en_US", "en-US")));
        assert_eq!(headers("de-DE"), Some(("de_DE", "de-DE")));
        assert_eq!(headers("pt-BR"), Some(("pt_BR", "pt-BR")));
        assert_eq!(headers("es-419"), Some(("es_419", "es-419")));
        assert_eq!(headers("sr-Cyrl-RS"), Some(("sr_RS", "sr-Cyrl-RS")));
        assert_eq!(headers("fr"), Some(("fr", "fr")));
        assert_eq!(headers(""), None);
        assert_eq!(headers("not a tag"), None);
    }
}
