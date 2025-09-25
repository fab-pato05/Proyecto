using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();

app.UseRouting();
app.UseEndpoints(endpoints => { endpoints.MapControllers(); });

app.Run();

//control de verificacion 

[ApiController]
[Route("api/[controller]")]
public class VerifyController : ControllerBase
{
    private readonly HttpClient _httpClient;
    private const string subscriptionKey = "TU_FACE_API_KEY";
    private const string endpoint = "https://TU_REGION.api.cognitive.microsoft.com/face/v1.0/verify";

    public VerifyController(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient();
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromForm] IFormFile documentPhoto, [FromForm] IFormFile selfiePhoto)
    {
        if (documentPhoto == null || selfiePhoto == null)
            return BadRequest(new { message = "Faltan imágenes" });

        // Detectar rostros en ambas imágenes
        var docFaceId = await DetectFaceId(documentPhoto);
        var selfieFaceId = await DetectFaceId(selfiePhoto);

        if (docFaceId == null || selfieFaceId == null)
            return BadRequest(new { message = "No se detectaron rostros" });

        //Verificar coincidencia
        var verifyUrl = endpoint;
        var body = new
        {
            faceId1 = docFaceId,
            faceId2 = selfieFaceId
        };

        var request = new HttpRequestMessage(HttpMethod.Post, verifyUrl);
        request.Headers.Add("Ocp-Apim-Subscription-Key", subscriptionKey);
        request.Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(body));
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

        var response = await _httpClient.SendAsync(request);
        var result = await response.Content.ReadAsStringAsync();

        return Ok(new { message = result });
    }
    //detectar el faceId 
    private async Task<string?> DetectFaceId(IFormFile file)
    {
        var detectUrl = "https://TU_REGION.api.cognitive.microsoft.com/face/v1.0/detect?returnFaceId=true";
        var request = new HttpRequestMessage(HttpMethod.Post, detectUrl);
        request.Headers.Add("Ocp-Apim-Subscription-Key", subscriptionKey);

        using (var stream = file.OpenReadStream())
        {
            request.Content = new StreamContent(stream);
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

            var response = await _httpClient.SendAsync(request);
            var result = await response.Content.ReadAsStringAsync();

            // Extraer faceId del JSON (simplificado)
            using var doc = System.Text.Json.JsonDocument.Parse(result);
            if (doc.RootElement.GetArrayLength() > 0)
                return doc.RootElement[0].GetProperty("faceId").GetString();
        }
        return null;
    }
}
