import {
  RekognitionClient,
  DetectLabelsCommand,
} from "npm:@aws-sdk/client-rekognition";

// AWS Configuration using environment variables
const AWS_CONFIG = {
  region: Deno.env.get("AWS_REGION"),
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") || "",
    sessionToken: Deno.env.get("AWS_SESSION_TOKEN"), // Optional for temporary credentials
  },
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Only accept POST requests to /upload
  if (req.method !== "POST" || !req.url.endsWith("/upload")) {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof Blob)) {
      return new Response(JSON.stringify({ error: "No image file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const imageBytes = new Uint8Array(await file.arrayBuffer());

    // Create AWS Rekognition client
    const rekognition = new RekognitionClient(AWS_CONFIG);

    const params = {
      Image: {
        Bytes: imageBytes,
      },
      Features: ["GENERAL_LABELS", "IMAGE_PROPERTIES"],
      Settings: {
        GeneralLabels: {
          LabelCategoryInclusionFilters: ["Color"],
        },
      },
    };

    const command = new DetectLabelsCommand(params);
    const response = await rekognition.send(command);

    // Format the response
    const result = {
      dominantColors: [],
      foregroundColors: [],
      backgroundColors: [],
      quality: response.Quality,
      colorProperties:
        response.ImageProperties?.DominantColors?.map((color) => ({
          name: color.ColorName,
          hexCode: color.HexCode,
          percentage: color.Percentage,
          confidence: color.Confidence,
        })) || [],
    };

    // Process labels to extract color information
    if (response.Labels) {
      response.Labels.forEach((label) => {
        if (label.Categories?.some((cat) => cat.Name === "Color")) {
          const colorInfo = {
            name: label.Name,
            confidence: label.Confidence,
            parents: label.Parents?.map((p) => p.Name) || [],
          };

          if (label.LocationHints?.some((hint) => hint.Type === "Foreground")) {
            result.foregroundColors.push(colorInfo);
          } else if (
            label.LocationHints?.some((hint) => hint.Type === "Background")
          ) {
            result.backgroundColors.push(colorInfo);
          } else {
            result.dominantColors.push(colorInfo);
          }
        }
      });
    }

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
