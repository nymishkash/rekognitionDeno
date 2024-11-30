import { 
    RekognitionClient,
    DetectLabelsCommand,
    DetectTextCommand,
    RecognizeCelebritiesCommand,
    DetectModerationLabelsCommand,
    GetImagePropertiesCommand,
  } from "npm:@aws-sdk/client-rekognition";
  
  const AWS_CONFIG = {
    region: Deno.env.get("AWS_REGION"),
    credentials: {
      accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") || "",
      secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") || "",
      sessionToken: Deno.env.get("AWS_SESSION_TOKEN"),
    }
  };
  
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
  
    if (req.method !== "POST" || !req.url.endsWith("/upload")) {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }
  
    try {
      const formData = await req.formData();
      const file = formData.get("image");
  
      if (!file || !(file instanceof Blob)) {
        return new Response(JSON.stringify({ error: "No image file provided" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
  
      const imageBytes = new Uint8Array(await file.arrayBuffer());
  
      const rekognition = new RekognitionClient(AWS_CONFIG);
      
      // Run all possible detection operations in parallel
      const [
        labelResponse,
        textResponse,
        celebrityResponse,
        moderationResponse,
        imagePropertiesResponse
      ] = await Promise.all([
        // Detect labels (objects, scenes, concepts)
        rekognition.send(new DetectLabelsCommand({
          Image: { Bytes: imageBytes },
          MaxLabels: 100,
          MinConfidence: 50,
        })),
  
        // Detect text in image
        rekognition.send(new DetectTextCommand({
          Image: { Bytes: imageBytes },
        })),
  
        // Detect celebrities
        rekognition.send(new RecognizeCelebritiesCommand({
          Image: { Bytes: imageBytes },
        })),
  
        // Detect content moderation labels
        rekognition.send(new DetectModerationLabelsCommand({
          Image: { Bytes: imageBytes },
          MinConfidence: 50,
        })),
  
        // Get image properties
        rekognition.send(new GetImagePropertiesCommand({
          Image: { Bytes: imageBytes },
        }))
      ]);
  
      // Comprehensive result object with all available data
      const result = {
        // General labels and scene detection
        labels: {
          all: labelResponse.Labels || [],
          byConfidence: (labelResponse.Labels || [])
            .sort((a, b) => (b.Confidence || 0) - (a.Confidence || 0)),
          categories: (labelResponse.Labels || []).reduce((acc: any, label) => {
            if (label.Categories) {
              label.Categories.forEach(cat => {
                if (!acc[cat.Name]) acc[cat.Name] = [];
                acc[cat.Name].push(label);
              });
            }
            return acc;
          }, {}),
        },
  
        // Text detection
        text: {
          all: textResponse.TextDetections || [],
          lines: textResponse.TextDetections?.filter(t => t.Type === 'LINE') || [],
          words: textResponse.TextDetections?.filter(t => t.Type === 'WORD') || [],
        },
  
        // Celebrity recognition
        celebrities: {
          detected: celebrityResponse.CelebrityFaces || [],
          unrecognized: celebrityResponse.UnrecognizedFaces || [],
        },
  
        // Content moderation
        moderation: {
          labels: moderationResponse.ModerationLabels || [],
          categories: (moderationResponse.ModerationLabels || []).reduce((acc: any, label) => {
            if (!acc[label.ParentName]) acc[label.ParentName] = [];
            acc[label.ParentName].push(label);
            return acc;
          }, {}),
        },
  
        // Image properties
        properties: {
          quality: imagePropertiesResponse.Quality,
          backgroundColor: imagePropertiesResponse.Background,
          foregroundColor: imagePropertiesResponse.Foreground,
          dominantColors: imagePropertiesResponse.DominantColors,
        },
  
        // Image metadata
        metadata: {
          size: imageBytes.length,
          timestamp: new Date().toISOString(),
          imageName: (file as File).name,
          mimeType: (file as File).type,
        }
      };
  
      return new Response(JSON.stringify(result), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
  
    } catch (error) {
      console.error('Full error:', error);
      return new Response(JSON.stringify({ 
        error: "Internal server error", 
        details: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  });