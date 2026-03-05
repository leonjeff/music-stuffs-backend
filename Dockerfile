FROM node:20-bookworm-slim

# Instalar ffmpeg y audiowaveform con todas sus dependencias runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    wget \
    ca-certificates \
    libboost-filesystem1.74.0 \
    libboost-program-options1.74.0 \
    libid3tag0 \
    libmad0 \
    libsndfile1 \
    libgd3 \
    && wget "https://github.com/bbc/audiowaveform/releases/download/1.10.1/audiowaveform_1.10.1-1-12_amd64.deb" -O /tmp/aw.deb \
    && dpkg -i /tmp/aw.deb \
    && rm /tmp/aw.deb \
    && apt-get purge -y --auto-remove wget \
    && rm -rf /var/lib/apt/lists/*

# Verificar instalación — el build falla si audiowaveform no está disponible
RUN audiowaveform --version

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/main"]
