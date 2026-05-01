# Documentacao do Usuario

Status: Rascunho interno  
Versao: 0.1  
Objetivo: servir como base para a futura pagina publica de ajuda, regras e funcionamento da plataforma.

## 1. Visao geral

O PosterPremiado e uma plataforma na qual o usuario pode adquirir um poster digital vinculado a uma promocao ativa e, com isso, receber numeros promocionais para participar de um sorteio.

Quando varias promocoes compartilham o mesmo concurso, todas elas participam do mesmo sorteio. Isso significa que o usuario participa da rodada correspondente ao concurso da promocao adquirida, independentemente da quantidade de numeros recebidos naquela compra.

Este documento descreve, em nivel geral, como a plataforma funciona hoje e quais pontos ainda precisam de texto final para publicacao.

## 2. Como a plataforma funciona

- O usuario cria uma conta e confirma seu email.
- O usuario acessa o painel e escolhe uma promocao ativa.
- A compra e iniciada por meio do checkout do provedor de pagamento.
- Depois da aprovacao do pagamento, o sistema libera o poster adquirido e vincula numeros promocionais a essa compra.
- Esses numeros passam a participar do concurso associado a promocao.
- O sorteio e realizado com base na regra oficial da rodada.
- O resultado pode ser exibido na plataforma e/ou em live organizada pela equipe.

## 3. Cadastro e acesso

Atualmente, o cadastro exige:

- nome completo
- email valido
- senha
- CPF valido
- data de nascimento

Regras atuais do cadastro:

- o usuario deve confirmar o email informado
- a plataforma esta disponivel apenas para maiores de 18 anos
- o CPF informado deve passar pela validacao aplicada no sistema

[A COMPLETAR] Politica oficial de elegibilidade  
[A COMPLETAR] Regras para contas duplicadas  
[A COMPLETAR] Regras para recuperacao de acesso e redefinicao de senha

## 4. Compra de poster e aquisicao de numeros

### 4.1 Inicio da compra

Ao selecionar uma promocao, o usuario inicia uma compra vinculada a:

- promocao escolhida
- concurso correspondente
- valor da promocao
- pacote de numeros promocionais previsto para aquela oferta

### 4.2 Processamento do pagamento

O pagamento e processado em ambiente do provedor de pagamento integrado a plataforma. A plataforma registra os dados operacionais necessarios para acompanhar a cobranca, como:

- identificador interno da compra
- valor
- status do pagamento
- data e hora do registro
- referencia da transacao
- promocao e concurso vinculados

### 4.3 Liberacao do poster e dos numeros

Depois que o pagamento e aprovado, o sistema:

- atualiza o status da compra
- libera o poster digital correspondente
- gera e vincula os numeros promocionais daquela compra

Observacao importante:

- os numeros podem aparecer imediatamente ou apos um curto periodo de sincronizacao automatica
- enquanto a sincronizacao estiver em andamento, o painel pode exibir que os numeros ainda estao sendo processados

### 4.4 Onde o usuario ve os numeros

Os numeros promocionais podem ser exibidos:

- no painel do usuario
- na tela de retorno apos o checkout
- em futuras areas de acompanhamento da conta, se houver expansao da experiencia

[A COMPLETAR] Texto final sobre prazo maximo de sincronizacao  
[A COMPLETAR] Politica de cancelamento, estorno ou recompra  
[A COMPLETAR] Regras para compras recusadas, pendentes ou expiradas

## 5. Como funcionam os concursos e sorteios

### 5.1 Concurso

Cada promocao pertence a um concurso. O concurso funciona como o agrupador oficial das promocoes participantes de uma mesma rodada.

Na pratica:

- promocoes diferentes podem compartilhar o mesmo concurso
- todas as compras vinculadas ao mesmo concurso entram no mesmo sorteio
- os numeros promocionais passam a disputar uma unica rodada correspondente a esse concurso

### 5.2 Formacao do sorteio

O sorteio considera os numeros confirmados e vinculados a compras aprovadas dentro do concurso correspondente.

Em termos operacionais:

- somente numeros vinculados a pagamentos aprovados entram na disputa
- os numeros ficam associados ao concurso da promocao comprada
- o sorteio e consolidado pela equipe organizadora no ambiente administrativo

### 5.3 Regra atual do numero da rodada

A regra atual considera os 6 digitos completos do primeiro premio oficial da Loteria Federal para definir o numero da rodada.

Fluxo atual:

- a equipe consulta o resultado oficial
- o primeiro premio oficial e informado ou confirmado
- os 6 digitos completos geram o numero da rodada

### 5.4 Criterio de ganhador

Regra atual do sistema:

- primeiro, o sistema tenta localizar um numero exato correspondente ao numero da rodada
- se houver correspondencia exata, esse numero e tratado como ganhador
- se nao houver correspondencia exata, a organizacao pode acionar uma segunda etapa para localizar o numero participante mais proximo

Na etapa de numero mais proximo:

- a revelacao pode ser refeita na cena da live
- o sistema identifica o numero participante mais proximo do numero oficial
- esse criterio complementar e usado apenas quando nao existe ganhador em cheio

[A COMPLETAR] Texto juridico oficial da regra de desempate  
[A COMPLETAR] Politica publica para casos de empate tecnico  
[A COMPLETAR] Forma oficial de publicacao do resultado final  
[A COMPLETAR] Regras sobre premios nao reclamados

## 6. Pagamentos e status de compra

Os estados de compra podem incluir, entre outros:

- pagamento aprovado
- pagamento em analise
- pagamento nao concluido

Quando o pagamento e aprovado, o usuario pode passar a ter acesso:

- ao poster digital adquirido
- aos numeros promocionais da compra
- ao acompanhamento da rodada vinculada ao concurso da promocao

[A COMPLETAR] Lista oficial e publica de todos os status aceitos  
[A COMPLETAR] Prazos de compensacao por metodo de pagamento  
[A COMPLETAR] Regras de compra internacional, se aplicavel

## 7. Seguranca da plataforma

### 7.1 Conta e autenticacao

A plataforma utiliza autenticacao de usuario para proteger o acesso ao painel e aos recursos da conta.

Medidas atuais observadas no sistema:

- login com email e senha
- confirmacao de email para ativacao da conta
- validacao de idade minima no cadastro
- validacao de CPF no fluxo de criacao de conta

### 7.2 Pagamentos

O processamento da cobranca acontece com provedor de pagamento integrado. A plataforma registra os dados operacionais da compra e o retorno do pagamento, mas o ambiente de cobranca pertence ao provedor.

### 7.3 Controles operacionais e moderacao

Por motivos de seguranca, moderacao ou operacao, a plataforma pode aplicar restricoes temporarias ou permanentes em recursos da conta, como:

- bloqueio de envio no chat publico
- limitacoes operacionais relacionadas ao uso da conta
- analise de mensagens denunciadas por outros usuarios

[A COMPLETAR] Politica oficial antifraude  
[A COMPLETAR] Politica de bloqueio preventivo de contas  
[A COMPLETAR] Procedimento de contestacao e revisao de bloqueios

## 8. Armazenamento e tratamento de dados

### 8.1 Dados que podem ser armazenados

Com base no funcionamento atual da plataforma, podem ser armazenados dados como:

- nome completo
- email
- CPF
- data de nascimento
- avatar e preferencias visuais do perfil
- historico de compras
- status e referencias de pagamento
- numeros promocionais vinculados a cada compra
- mensagens de chat publico e privado
- denuncias de mensagens
- registros operacionais e de auditoria

### 8.2 Finalidades do armazenamento

Os dados sao usados, em linhas gerais, para:

- autenticar e identificar o usuario
- validar elegibilidade
- registrar compras e pagamentos
- vincular numeros promocionais a concursos e sorteios
- disponibilizar downloads do poster adquirido
- viabilizar suporte e moderacao
- manter historico operacional e rastreabilidade

### 8.3 Dados de pagamento

A plataforma pode registrar metadados operacionais do pagamento, como:

- referencia interna da compra
- identificador da transacao
- valor
- status
- data de aprovacao ou atualizacao

O tratamento de dados financeiros sensiveis e sujeito ao fluxo e as politicas do provedor de pagamento utilizado.

[A COMPLETAR] Base legal de tratamento de dados  
[A COMPLETAR] Prazo de retencao por categoria de dado  
[A COMPLETAR] Politica LGPD e direitos do titular  
[A COMPLETAR] Encarregado/DPO e canal oficial de privacidade  
[A COMPLETAR] Regras de exclusao, anonimizacao e portabilidade

## 9. Regras do chat publico

O chat publico existe para interacao entre participantes durante a experiencia da plataforma.

### 9.1 Uso esperado

E esperado que o usuario utilize o chat de forma respeitosa, segura e compativel com a finalidade da comunidade.

### 9.2 Moderacao e denuncias

Atualmente, o sistema permite:

- envio de mensagens publicas
- denuncia de mensagens
- analise administrativa de conteudo reportado
- bloqueio de envio no chat publico em caso de necessidade

### 9.3 Regras recomendadas para a versao publica

Inserir aqui a politica final de convivencia, incluindo exemplos de condutas proibidas.

[A COMPLETAR] Lista oficial de comportamentos proibidos  
[A COMPLETAR] Escala de penalidades e reincidencia  
[A COMPLETAR] Regras sobre spam, links, autopromocao e mensagens ofensivas  
[A COMPLETAR] Regras sobre discurso de odio, ameacas e dados pessoais de terceiros

## 10. Especificacao do canal de suporte

O canal de suporte e uma conversa privada entre o usuario e a equipe organizadora.

Uso atual:

- o usuario pode enviar mensagens privadas para a equipe
- o canal fica separado do chat publico
- o historico de atendimento pode ser usado para acompanhamento operacional

Uso recomendado na documentacao final:

- orientar o usuario a usar o suporte para duvidas sobre compra, acesso, poster, numeros e sorteio
- orientar o usuario a nao usar o chat publico para informacoes sensiveis
- informar prazo medio e horario de atendimento quando isso estiver definido

[A COMPLETAR] SLA de atendimento  
[A COMPLETAR] Horario oficial de suporte  
[A COMPLETAR] Canais complementares de contato  
[A COMPLETAR] Casos que devem ser tratados exclusivamente pelo suporte

## 11. Responsabilidades do usuario

O usuario deve:

- manter seus dados corretos e atualizados
- proteger suas credenciais de acesso
- utilizar a conta de forma pessoal e regular
- respeitar as regras do chat e da comunidade
- acompanhar os status de pagamento, liberacao de numeros e resultados

[A COMPLETAR] Politica de uso indevido da conta  
[A COMPLETAR] Regras sobre compartilhamento de acesso  
[A COMPLETAR] Consequencias para informacoes cadastrais falsas

## 12. Transparencia e comunicacao de resultados

A plataforma pode informar o andamento das rodadas e o resultado dos sorteios por meio de:

- painel do usuario
- tela de status da compra
- area de acompanhamento do concurso
- live da organizacao
- canais oficiais de comunicacao

[A COMPLETAR] Ordem oficial de prioridade entre os canais  
[A COMPLETAR] Modelo oficial de comunicacao de resultado  
[A COMPLETAR] Politica de correcao de erro operacional ou publicacao indevida

## 13. Limitacoes deste rascunho

Este documento ainda nao substitui:

- termos de uso
- politica de privacidade
- regulamento promocional
- politica de cancelamento e estorno
- politica de moderacao

Ele deve ser tratado como base inicial de documentacao para organizacao do conteudo final.

## 14. Espacos reservados para completar

[A COMPLETAR] Nome juridico da operacao ou marca responsavel  
[A COMPLETAR] CNPJ e endereco oficial  
[A COMPLETAR] Regulamento completo da promocao  
[A COMPLETAR] Politica de premios e repasse  
[A COMPLETAR] Contato oficial de suporte  
[A COMPLETAR] Contato oficial de privacidade  
[A COMPLETAR] Regras de estorno e cancelamento  
[A COMPLETAR] Politica de cookies, se houver  
[A COMPLETAR] Idiomas disponiveis  
[A COMPLETAR] Paises e territorios atendidos  
[A COMPLETAR] Politica de acessibilidade

## 15. Historico deste documento

- Versao 0.1 - rascunho inicial com base no funcionamento atual da plataforma e espacos reservados para complementacao
