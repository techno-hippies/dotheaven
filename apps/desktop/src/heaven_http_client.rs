use gpui::http_client::{self, HttpClient};
use std::any::type_name;
use std::time::Duration;

/// HTTP client implementation for GPUI assets (e.g. `gpui::img("https://...")`).
///
/// GPUI ships with a `NullHttpClient` by default, so without setting a real
/// `HttpClient` remote images will always fail to load and you'll only see
/// placeholders/grey boxes.
#[derive(Clone)]
pub(crate) struct HeavenHttpClient {
    agent: ureq::Agent,
    user_agent: http_client::http::HeaderValue,
}

impl HeavenHttpClient {
    pub(crate) fn new() -> Self {
        // Don't convert 4xx/5xx into transport errors. GPUI wants a Response
        // so it can decide what to do with non-2xx statuses.
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(20)))
            .http_status_as_error(false)
            .build();
        let agent: ureq::Agent = config.into();

        Self {
            agent,
            user_agent: http_client::http::HeaderValue::from_static("heaven-desktop"),
        }
    }
}

impl HttpClient for HeavenHttpClient {
    fn type_name(&self) -> &'static str {
        type_name::<Self>()
    }

    fn user_agent(&self) -> Option<&http_client::http::HeaderValue> {
        Some(&self.user_agent)
    }

    fn proxy(&self) -> Option<&http_client::Url> {
        None
    }

    fn send(
        &self,
        req: http_client::Request<http_client::AsyncBody>,
    ) -> futures::future::BoxFuture<
        'static,
        anyhow::Result<http_client::Response<http_client::AsyncBody>>,
    > {
        use futures::io::AsyncReadExt as _;
        use futures::FutureExt as _;

        let agent = self.agent.clone();
        let ua = self.user_agent.clone();

        async move {
            // `ureq` is synchronous, so we buffer the request/response bodies.
            let (mut parts, mut body) = req.into_parts();
            let mut body_bytes = Vec::new();
            body.read_to_end(&mut body_bytes).await?;

            if !parts
                .headers
                .contains_key(http_client::http::header::USER_AGENT)
            {
                parts
                    .headers
                    .insert(http_client::http::header::USER_AGENT, ua);
            }

            smol::unblock(
                move || -> anyhow::Result<http_client::Response<http_client::AsyncBody>> {
                    let request = http_client::Request::from_parts(parts, body_bytes);

                    let mut response = agent
                        .run(request)
                        .map_err(|e| anyhow::anyhow!(e.to_string()))?;

                    let (parts, mut body) = response.into_parts();
                    let bytes = body
                        .into_with_config()
                        .limit(25 * 1024 * 1024)
                        .read_to_vec()
                        .map_err(|e| anyhow::anyhow!(e.to_string()))?;

                    Ok(http_client::Response::from_parts(
                        parts,
                        http_client::AsyncBody::from(bytes),
                    ))
                },
            )
            .await
        }
        .boxed()
    }
}
