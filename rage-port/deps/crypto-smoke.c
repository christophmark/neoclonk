/* Exercises the unmodified APIs Rage uses, linked against genuine libcrypto. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <openssl/sha.h>
#include <openssl/md5.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/x509.h>
int main(void) {
  unsigned char sha[SHA_DIGEST_LENGTH], md5[MD5_DIGEST_LENGTH];
  const unsigned char expectedSHA[]={0xa9,0x99,0x3e,0x36,0x47,0x06,0x81,0x6a,0xba,0x3e,0x25,0x71,0x78,0x50,0xc2,0x6c,0x9c,0xd0,0xd8,0x9d};
  const unsigned char expectedMD5[]={0x90,0x01,0x50,0x98,0x3c,0xd2,0x4f,0xb0,0xd6,0x96,0x3f,0x7d,0x28,0xe1,0x7f,0x72};
  SHA_CTX ctx;assert(SHA1_Init(&ctx));assert(SHA1_Update(&ctx,"abc",3));assert(SHA1_Final(sha,&ctx));
  assert(!memcmp(sha,expectedSHA,sizeof(sha)));
  MD5((const unsigned char*)"abc",3,md5);assert(!memcmp(md5,expectedMD5,sizeof(md5)));
  BIO *certificate=BIO_new_file("/certificate.pem","r");assert(certificate);
  X509 *x509=PEM_read_bio_X509(certificate,0,0,0);assert(x509);
  EVP_PKEY *key=X509_get_pubkey(x509);assert(key);
  EVP_MD_CTX digest;assert(EVP_VerifyInit(&digest,EVP_sha1()));assert(EVP_VerifyUpdate(&digest,"abc",3));
  unsigned char signature[1024];FILE *signatureFile=fopen("/signature.bin","rb");assert(signatureFile);
  size_t signatureLength=fread(signature,1,sizeof(signature),signatureFile);fclose(signatureFile);assert(signatureLength);
  assert(EVP_VerifyFinal(&digest,signature,signatureLength,key)==1);
  EVP_MD_CTX_cleanup(&digest);assert(EVP_VerifyInit(&digest,EVP_sha1()));assert(EVP_VerifyUpdate(&digest,"abd",3));
  assert(EVP_VerifyFinal(&digest,signature,signatureLength,key)==0);
  EVP_MD_CTX_cleanup(&digest);EVP_PKEY_free(key);X509_free(x509);BIO_free(certificate);
  BIO *encoded=BIO_new_mem_buf("YWJj\n",5);BIO *base64=BIO_new(BIO_f_base64());BIO *decoder=BIO_push(base64,encoded);
  char decoded[4]={0};assert(BIO_read(decoder,decoded,3)==3);assert(!memcmp(decoded,"abc",3));BIO_free_all(decoder);
  puts("Original Rage crypto APIs: SHA1, MD5, X509/PEM, EVP verification, BIO base64 passed");
  return 0;
}
